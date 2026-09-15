package game

import "math"

const (
	dragonEngageRange = 240
	dragonFireRange   = 260
	dragonWarningMS   = 1400
	dragonFireMS      = 700
	dragonRecoveryMS  = 2400
	dragonFireDamage  = 28
)

func inFireCone(p Point, b Breath) bool {
	dx, dy := p.X-b.Origin.X, p.Y-b.Origin.Y
	distance := math.Hypot(dx, dy)
	if distance > dragonFireRange {
		return false
	}
	if distance == 0 {
		return true
	}
	ax, ay := b.Aim.X-b.Origin.X, b.Aim.Y-b.Origin.Y
	length := math.Hypot(ax, ay)
	return length > 0 && (dx*ax+dy*ay)/(distance*length) >= math.Cos(math.Pi/6)-1e-12
}

func advanceDragons(s *State, ms int64) bool {
	hit := false
	for i := range s.Enemies {
		e := &s.Enemies[i]
		if e.Kind != "dragon" {
			continue
		}
		// Apply announced flames after movement and before clearing a lethal strike's
		// encounter, so neither a valid dodge nor active fire disappears in that order.
		if b := e.Breath; b != nil {
			if ms >= b.StartsAt && ms < b.EndsAt && !b.Hit && inFireCone(s.Position, *b) {
				s.HP = max(0, s.HP-dragonFireDamage)
				b.Hit = true
				hit = true
			}
			// Expired flames never deal retroactive damage after a suspended client.
			if ms >= b.EndsAt {
				e.Breath = nil
			}
		}
		if e.HP <= 0 {
			e.Breath, e.NextBreathAt = nil, 0
			continue
		}
		if e.Breath != nil {
			continue
		}
		origin := Point{e.X, e.Y}
		if dist(s.Position, origin) > dragonEngageRange || s.HP <= 0 {
			e.NextBreathAt = 0
			continue
		}
		if ms < e.NextBreathAt {
			continue
		}
		aim := s.Position
		if aim == origin {
			aim.Y++
		}
		// Always give the full warning from this command's time; never replay missed cycles.
		e.Breath = &Breath{Origin: origin, Aim: aim, StartsAt: ms + dragonWarningMS, EndsAt: ms + dragonWarningMS + dragonFireMS}
		e.NextBreathAt = e.Breath.EndsAt + dragonRecoveryMS
	}
	return hit
}

func rescue(s *State, ms int64) {
	s.Gold -= GoldLostOnDefeat(s.Gold)
	s.HP, s.Mana = s.MaxHP, s.MaxMana
	s.Position = CatalogData.World.Spawn
	s.LastMoveAt = ms
	for i := range s.Enemies {
		if s.Enemies[i].Kind == "dragon" {
			s.Enemies[i].Breath = nil
			s.Enemies[i].NextBreathAt = 0
		}
	}
}
