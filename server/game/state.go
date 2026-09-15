package game

import (
	"maps"
	"slices"
	"time"
)

func New(now time.Time) State {
	return Upgrade(State{
		Version: 0, Name: "Little Wanderer", Level: 1, NextLevelXP: 100,
		HP: 100, MaxHP: 100, Mana: 60, MaxMana: 60, Gold: 80,
		Inventory: map[string]int{"rusty_sword": 1, "potion": 3},
		Equipped:  "rusty_sword", Position: CatalogData.World.Spawn,
		Enemies: []Enemy{
			{ID: "moss-1", X: 950, Y: 470, HP: 36, MaxHP: 36},
			{ID: "moss-2", X: 1130, Y: 580, HP: 36, MaxHP: 36},
			{ID: "moss-3", X: 1270, Y: 630, HP: 36, MaxHP: 36},
		},
		Nodes:      []Node{{ID: "wood", X: 1100, Y: 560}, {ID: "iron", X: 1160, Y: 430}},
		LastMoveAt: now.UnixMilli(),
	})
}

// Upgrade adds new encounters without replacing a saved hero or resetting enemies.
func Upgrade(s State) State {
	s = Clone(s)
	found := false
	for i := range s.Enemies {
		e := &s.Enemies[i]
		if e.ID == "cinderwing" {
			e.Kind, e.Name = "dragon", "Cinderwing"
			found = true
		} else if e.Kind == "" {
			e.Kind, e.Name = "slime", "Moss slime"
		}
	}
	if !found {
		s.Enemies = append(s.Enemies, Enemy{ID: "cinderwing", Kind: "dragon", Name: "Cinderwing", X: 1355, Y: 200, HP: 240, MaxHP: 240})
	}
	return s
}
func Clone(s State) State {
	s.Inventory = maps.Clone(s.Inventory)
	s.Enemies = slices.Clone(s.Enemies)
	for i := range s.Enemies {
		if s.Enemies[i].Breath != nil {
			breath := *s.Enemies[i].Breath
			s.Enemies[i].Breath = &breath
		}
	}
	s.Nodes = slices.Clone(s.Nodes)
	return s
}
