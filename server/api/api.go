package api

import (
	"bytes"
	"context"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"mime"
	"net/url"
	"regexp"
	"strings"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/gofiber/fiber/v3/middleware/limiter"
	"github.com/gofiber/fiber/v3/middleware/recover"

	"smallhero/server/game"
	"smallhero/server/store"
)

const cookieName = "smallhero_session"

var uuid = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$`)

func ValidOrigin(origin string) bool {
	u, err := url.Parse(origin)
	if err != nil || u.Host == "" || u.User != nil || u.RawQuery != "" || u.Fragment != "" || u.Path != "" {
		return false
	}
	return u.Scheme == "https" || (u.Scheme == "http" && (u.Hostname() == "localhost" || u.Hostname() == "127.0.0.1" || u.Hostname() == "::1"))
}
func New(s *store.Store, origin string) *fiber.App {
	app := fiber.New(fiber.Config{BodyLimit: 2048, ReadTimeout: 5 * time.Second, WriteTimeout: 10 * time.Second, IdleTimeout: 30 * time.Second, ErrorHandler: func(c fiber.Ctx, err error) error {
		code := 500
		var fe *fiber.Error
		if errors.As(err, &fe) {
			code = fe.Code
		}
		message := "Request failed."
		if code == 500 {
			slog.Error("request failed", "error", err)
		}
		return c.Status(code).JSON(fiber.Map{"error": message, "code": "request_failed"})
	}})
	app.Use(recover.New())
	app.Use(func(c fiber.Ctx) error {
		c.Set("Cache-Control", "no-store")
		c.Set("X-Content-Type-Options", "nosniff")
		return c.Next()
	})
	app.Get("/api/health", func(c fiber.Ctx) error {
		ctx, cancel := context.WithTimeout(c.Context(), 2*time.Second)
		defer cancel()
		if s.DB.Ping(ctx) != nil {
			return c.Status(503).JSON(fiber.Map{"error": "Database unavailable.", "code": "unavailable"})
		}
		return c.JSON(fiber.Map{"status": "ok"})
	})
	app.Use("/api", limiter.New(limiter.Config{Max: 300, Expiration: time.Minute, LimitReached: func(c fiber.Ctx) error {
		return c.Status(429).JSON(fiber.Map{"error": "Slow down and try again.", "code": "rate_limit"})
	}}))
	app.Use("/api", func(c fiber.Ctx) error {
		if c.Method() == "POST" {
			if c.Get("Origin") != origin {
				return c.Status(403).JSON(fiber.Map{"error": "Origin not allowed.", "code": "origin"})
			}
			media, _, err := mime.ParseMediaType(c.Get("Content-Type"))
			if err != nil || media != "application/json" {
				return c.Status(415).JSON(fiber.Map{"error": "Expected JSON.", "code": "invalid_json"})
			}
		}
		return c.Next()
	})
	app.Post("/api/session", limiter.New(limiter.Config{Max: 15, Expiration: time.Minute, LimitReached: func(c fiber.Ctx) error {
		return c.Status(429).JSON(fiber.Map{"error": "Too many session requests. Try again shortly.", "code": "rate_limit"})
	}}), func(c fiber.Ctx) error {
		var body struct{}
		if decode(c.Body(), &body) != nil {
			return badJSON(c)
		}
		ctx, cancel := context.WithTimeout(c.Context(), 5*time.Second)
		defer cancel()
		token := c.Cookies(cookieName)
		if validToken(token) {
			response, err := s.Get(ctx, token)
			if err == nil {
				return c.JSON(response)
			}
			if !errors.Is(err, store.ErrSession) {
				return failure(c, err)
			}
		}
		token, response, err := s.Create(ctx)
		if err != nil {
			return failure(c, err)
		}
		c.Cookie(&fiber.Cookie{Name: cookieName, Value: token, Path: "/api", HTTPOnly: true, Secure: strings.HasPrefix(origin, "https://"), SameSite: "Strict", MaxAge: 30 * 24 * 60 * 60})
		return c.JSON(response)
	})
	app.Get("/api/game", func(c fiber.Ctx) error {
		ctx, cancel := context.WithTimeout(c.Context(), 5*time.Second)
		defer cancel()
		token := c.Cookies(cookieName)
		if !validToken(token) {
			return failure(c, store.ErrSession)
		}
		response, err := s.Get(ctx, token)
		if err != nil {
			return failure(c, err)
		}
		return c.JSON(response)
	})
	app.Post("/api/commands", func(c fiber.Ctx) error {
		var command game.Command
		if decodeCommand(c.Body(), &command) != nil || !uuid.MatchString(command.ID) || game.Validate(command) != nil {
			return badJSON(c)
		}
		token := c.Cookies(cookieName)
		if !validToken(token) {
			return failure(c, store.ErrSession)
		}
		ctx, cancel := context.WithTimeout(c.Context(), 5*time.Second)
		defer cancel()
		response, err := s.Command(ctx, token, command)
		if err != nil {
			return failure(c, err)
		}
		return c.JSON(response)
	})
	return app
}
func validToken(t string) bool {
	if len(t) != 64 {
		return false
	}
	_, err := hex.DecodeString(t)
	return err == nil
}

// Flat protocol objects reject duplicate, null, and case-variant keys before decoding.
func decode(b []byte, out any) error {
	d := json.NewDecoder(bytes.NewReader(b))
	first, err := d.Token()
	if err != nil || first != json.Delim('{') {
		return errors.New("expected object")
	}
	seen := map[string]bool{}
	for d.More() {
		tok, err := d.Token()
		if err != nil {
			return err
		}
		key, ok := tok.(string)
		if !ok || seen[key] {
			return errors.New("duplicate key")
		}
		seen[key] = true
		var raw json.RawMessage
		if err := d.Decode(&raw); err != nil {
			return err
		}
		if bytes.Equal(bytes.TrimSpace(raw), []byte("null")) {
			return errors.New("null value")
		}
	}
	if _, err := d.Token(); err != nil {
		return err
	}
	var extra any
	if err := d.Decode(&extra); err != io.EOF {
		return errors.New("trailing JSON")
	}
	d = json.NewDecoder(bytes.NewReader(b))
	d.DisallowUnknownFields()
	return d.Decode(out)
}
func decodeCommand(b []byte, command *game.Command) error {
	if err := decode(b, command); err != nil {
		return err
	}
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(b, &fields); err != nil {
		return err
	}
	for _, required := range []string{"id", "version", "type"} {
		if _, ok := fields[required]; !ok {
			return errors.New("missing field")
		}
	}
	for key := range fields {
		switch key {
		case "id", "version", "type", "target", "x", "y":
		default:
			return errors.New("unknown field")
		}
	}
	return nil
}
func badJSON(c fiber.Ctx) error {
	return c.Status(400).JSON(fiber.Map{"error": "Invalid command or JSON body.", "code": "invalid_command"})
}
func failure(c fiber.Ctx, err error) error {
	switch {
	case errors.Is(err, store.ErrSession):
		return c.Status(401).JSON(fiber.Map{"error": "Session expired. Start a new adventure.", "code": "session"})
	case errors.Is(err, store.ErrConflict):
		return c.Status(409).JSON(fiber.Map{"error": "Save changed. Refresh and try again.", "code": "version_conflict"})
	case errors.Is(err, store.ErrReplay):
		return c.Status(409).JSON(fiber.Map{"error": "Command ID already used.", "code": "id_conflict"})
	case errors.Is(err, game.ErrAction):
		return c.Status(422).JSON(fiber.Map{"error": "Action unavailable. Check range, resources and cooldown.", "code": "action_unavailable"})
	default:
		slog.Error("storage request failed", "error", err)
		return c.Status(503).JSON(fiber.Map{"error": "Save unavailable. Please retry.", "code": "unavailable"})
	}
}
