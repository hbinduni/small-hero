package game

import (
	"errors"
	"math"
	"time"
)

var ErrAction = errors.New("action unavailable")

func Validate(c Command) error {
	if c.Version < 0 {
		return ErrAction
	}
	switch c.Type {
	case "move":
		if c.Target != "" || c.X == nil || c.Y == nil || math.IsNaN(*c.X) || math.IsNaN(*c.Y) || math.IsInf(*c.X, 0) || math.IsInf(*c.Y, 0) {
			return ErrAction
		}
	case "gather", "attack", "heavy_attack", "craft", "equip":
		if c.Target == "" || c.X != nil || c.Y != nil {
			return ErrAction
		}
	case "heal", "rest", "claim", "tick":
		if c.Target != "" || c.X != nil || c.Y != nil {
			return ErrAction
		}
	default:
		return ErrAction
	}
	return nil
}
func Apply(original State, c Command, now time.Time) (State, string, error) {
	reject := func() (State, string, error) { return original, "", ErrAction }
	if Validate(c) != nil {
		return reject()
	}
	s := Upgrade(original)
	ms := now.UnixMilli()
	for i := range s.Enemies {
		e := &s.Enemies[i]
		if e.HP == 0 && ms >= e.RespawnAt {
			e.HP = e.MaxHP
			e.RespawnAt = 0
			e.Breath, e.NextBreathAt = nil, 0
		}
	}
	event := c.Type
	switch c.Type {
	case "move":
		p := Point{*c.X, *c.Y}
		// Preserve up to two seconds of earned travel for delayed requests arriving in a burst.
		// Cap before charging distance so idle time cannot fund unlimited movement.
		creditAt := max(s.LastMoveAt, ms-2000)
		elapsed := float64(ms-creditAt) / 1000
		if !validSegment(s.Position, p) || dist(s.Position, p) > math.Max(0, 220*elapsed+40) {
			return reject()
		}
		distance := dist(s.Position, p)
		s.Position = p
		// Charge the tolerance against future travel instead of granting 40 free units per request.
		s.LastMoveAt = creditAt + int64(math.Ceil(distance/220*1000))
	case "gather":
		found := false
		for i := range s.Nodes {
			n := &s.Nodes[i]
			if n.ID == c.Target {
				if ms < n.ReadyAt || dist(s.Position, Point{n.X, n.Y}) > 100 {
					return reject()
				}
				s.Inventory[n.ID] += 2
				n.ReadyAt = ms + 8000
				found = true
			}
		}
		if !found {
			return reject()
		}
	case "attack", "heavy_attack":
		if ms-s.LastAttackAt < 600 {
			return reject()
		}
		damage := 0
		for _, i := range CatalogData.Items {
			if i.ID == s.Equipped {
				damage = i.Attack
			}
		}
		if c.Type == "heavy_attack" {
			if s.Mana < 15 {
				return reject()
			}
			s.Mana -= 15
			damage *= 2
		}
		found := false
		for i := range s.Enemies {
			e := &s.Enemies[i]
			if e.ID != c.Target {
				continue
			}
			if e.HP <= 0 || dist(s.Position, Point{e.X, e.Y}) > 105 {
				return reject()
			}
			found = true
			e.HP = max(0, e.HP-damage)
			if e.HP == 0 {
				if e.Kind == "dragon" {
					e.RespawnAt = ms + 60000
					s.Inventory["ember"] += 3
					s.Gold += 100
					s.XP += 120
					event = "dragon_defeat"
				} else {
					e.RespawnAt = ms + 15000
					s.Inventory["ember"]++
					s.Gold += 15
					s.XP += 30
					s.Kills++
					event = "defeat"
				}
				for s.XP >= s.NextLevelXP {
					s.XP -= s.NextLevelXP
					s.Level++
					s.NextLevelXP = 100 * s.Level
					s.MaxHP += 10
					s.HP = s.MaxHP
					s.MaxMana += 5
					s.Mana = s.MaxMana
				}
			} else if e.Kind != "dragon" {
				s.HP = max(0, s.HP-8)
			}
		}
		if !found {
			return reject()
		}
		s.LastAttackAt = ms
	case "craft":
		if dist(s.Position, CatalogData.World.Smithy) > 100 {
			return reject()
		}
		found := false
		for _, r := range CatalogData.Recipes {
			if r.ID != c.Target {
				continue
			}
			if s.Level < r.RequiredLevel || s.Gold < r.Gold {
				return reject()
			}
			for id, n := range r.Cost {
				if s.Inventory[id] < n {
					return reject()
				}
			}
			for id, n := range r.Cost {
				s.Inventory[id] -= n
			}
			s.Gold -= r.Gold
			s.Inventory[r.Result]++
			s.Crafted++
			if s.Inventory[s.Equipped] == 0 {
				s.Equipped = r.Result
			}
			found = true
		}
		if !found {
			return reject()
		}
	case "equip":
		found := false
		for _, i := range CatalogData.Items {
			if i.ID == c.Target && i.Kind == "weapon" && s.Inventory[i.ID] > 0 {
				s.Equipped = i.ID
				found = true
			}
		}
		if !found {
			return reject()
		}
	case "heal":
		if s.Inventory["potion"] <= 0 || s.HP == s.MaxHP {
			return reject()
		}
		s.Inventory["potion"]--
		s.HP = min(s.MaxHP, s.HP+45)
	case "rest":
		if dist(s.Position, CatalogData.World.Spawn) > 100 {
			return reject()
		}
		s.HP = s.MaxHP
		s.Mana = s.MaxMana
	case "claim":
		if s.QuestClaimed || s.Inventory["flame_blade"] < 1 || s.Kills < 3 || dist(s.Position, CatalogData.World.Smithy) > 100 {
			return reject()
		}
		s.QuestClaimed = true
		s.Gold += 100
	}
	if advanceDragons(&s, ms) && event != "dragon_defeat" {
		event = "fire_hit"
	}
	if s.HP == 0 {
		rescue(&s, ms)
		event = "rescue"
	}
	s.Version++
	s.LastActionAt = ms
	return s, event, nil
}
