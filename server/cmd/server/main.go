package main

import (
	"context"
	"errors"
	"log/slog"
	"net"
	"os"
	"os/signal"
	"syscall"
	"time"

	"smallhero/server/api"
	"smallhero/server/store"
)

func main() {
	if err := run(); err != nil {
		slog.Error("server stopped", "error", err)
		os.Exit(1)
	}
}
func run() error {
	origin := os.Getenv("APP_ORIGIN")
	databaseURL := os.Getenv("DATABASE_URL")
	if !api.ValidOrigin(origin) || databaseURL == "" {
		return errors.New("APP_ORIGIN must be a valid HTTPS origin (HTTP allowed only on loopback), and DATABASE_URL is required")
	}
	addr := os.Getenv("API_ADDR")
	if addr == "" {
		addr = "127.0.0.1:8080"
	}
	if _, _, err := net.SplitHostPort(addr); err != nil {
		return errors.New("invalid API_ADDR")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	s, err := store.Open(ctx, databaseURL)
	cancel()
	if err != nil {
		return errors.New("database startup failed; check DATABASE_URL and database availability")
	}
	defer s.DB.Close()
	app := api.New(s, origin)
	stop, stopCancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stopCancel()
	result := make(chan error, 1)
	go func() { result <- app.Listen(addr) }()
	slog.Info("Small Hero API listening", "address", addr)
	select {
	case err := <-result:
		return err
	case <-stop.Done():
		return app.ShutdownWithTimeout(8 * time.Second)
	}
}
