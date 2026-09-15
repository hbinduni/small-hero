package game

import (
	"math"
	"reflect"
	"testing"
	"time"
)

func TestDragonEncounterAvailable(t *testing.T) {
	now := time.Unix(100, 0)
	s := New(now)
	s.Position = Point{1355, 300}
	updated, _, err := Apply(s, Command{Type: "tick"}, now)
	if err != nil {
		t.Fatalf("idle encounter cannot advance: %v", err)
	}
	for _, e := range updated.Enemies {
		if e.ID == "cinderwing" && e.HP > 0 {
			return
		}
	}
	t.Fatal("new adventure has no dragon encounter")
}

func dragon(t *testing.T, s *State) *Enemy {
	t.Helper()
	for i := range s.Enemies {
		if s.Enemies[i].ID == "cinderwing" {
			return &s.Enemies[i]
		}
	}
	t.Fatal("dragon missing")
	return nil
}

func encounter(t *testing.T) State {
	t.Helper()
	s := New(time.UnixMilli(100000))
	s.Position = Point{1355, 300}
	s, _, err := Apply(s, Command{Type: "tick"}, time.UnixMilli(100000))
	if err != nil {
		t.Fatal(err)
	}
	return s
}

func TestDragonLocksAimAndDealsOneHit(t *testing.T) {
	s := encounter(t)
	e := dragon(t, &s)
	if e.Breath == nil || e.Breath.Origin != (Point{1355, 200}) || e.Breath.Aim != s.Position || e.Breath.StartsAt != 101400 || e.Breath.EndsAt != 102100 || e.NextBreathAt != 104500 {
		t.Fatalf("warning missing or incorrect: %+v", e)
	}
	for _, tc := range []struct {
		at int64
		hp int
	}{{101399, 100}, {101400, 72}, {101700, 72}, {102100, 72}, {104499, 72}} {
		var err error
		s, _, err = Apply(s, Command{Type: "tick"}, time.UnixMilli(tc.at))
		if err != nil || s.HP != tc.hp {
			t.Fatalf("at %d: hp %d want %d, %v", tc.at, s.HP, tc.hp, err)
		}
	}
	s, _, _ = Apply(s, Command{Type: "tick"}, time.UnixMilli(104500))
	if e := dragon(t, &s); e.Breath == nil || e.Breath.StartsAt != 105900 || e.Breath.Hit {
		t.Fatal("recovery did not produce a fresh warning")
	}
}

func TestMovementDodgesLockedBreathAndEnteringFlamesHits(t *testing.T) {
	s := encounter(t)
	s, _, err := Apply(s, Command{Type: "move", X: ptr(1300), Y: ptr(260)}, time.UnixMilli(101400))
	if err != nil || s.HP != 100 {
		t.Fatalf("legal sideways dodge failed: hp %d, %v", s.HP, err)
	}
	if e := dragon(t, &s); e.Breath == nil || e.Breath.Aim != (Point{1355, 300}) {
		t.Fatal("dragon tracked player during locked warning")
	}
	s, event, err := Apply(s, Command{Type: "move", X: ptr(1355), Y: ptr(300)}, time.UnixMilli(101800))
	if err != nil || s.HP != 72 || event != "fire_hit" {
		t.Fatalf("entering active flames: hp %d event %s, %v", s.HP, event, err)
	}
}

func TestFireConeBoundaries(t *testing.T) {
	for _, tc := range []struct {
		name            string
		distance, angle float64
		hit             bool
	}{
		{"center", 100, 0, true}, {"origin", 0, 180, true}, {"range edge", 260, 0, true},
		{"outside range", 260.001, 0, false}, {"angle edge", 100, 30, true},
		{"opposite angle edge", 100, -30, true}, {"outside angle", 100, 30.001, false}, {"behind", 100, 180, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			s := encounter(t)
			angle := tc.angle * math.Pi / 180
			s.Position = Point{1355 + tc.distance*math.Sin(angle), 200 + tc.distance*math.Cos(angle)}
			s, _, err := Apply(s, Command{Type: "tick"}, time.UnixMilli(101400))
			want := 100
			if tc.hit {
				want = 72
			}
			if err != nil || s.HP != want {
				t.Fatalf("hp %d want %d, %v", s.HP, want, err)
			}
		})
	}
}

func TestExpiredBreathNeverCatchesUpOfflineDamage(t *testing.T) {
	for _, at := range []int64{102100, 3700000} {
		s := encounter(t)
		s, _, err := Apply(s, Command{Type: "tick"}, time.UnixMilli(at))
		if err != nil || s.HP != 100 {
			t.Fatalf("expired fire caused retroactive damage at %d: %+v, %v", at, s, err)
		}
		e := dragon(t, &s)
		if at == 102100 && e.Breath != nil {
			t.Fatal("expired warning remained during recovery")
		}
		if at == 3700000 && (e.Breath == nil || e.Breath.StartsAt != at+1400 || e.Breath.Hit) {
			t.Fatal("offline gap did not begin one fresh warning")
		}
	}
}

func TestDragonDisengagesAfterAnnouncedBreath(t *testing.T) {
	s := encounter(t)
	s.Position = Point{1200, 400}
	s, _, _ = Apply(s, Command{Type: "tick"}, time.UnixMilli(101000))
	if dragon(t, &s).Breath == nil {
		t.Fatal("retreat cancelled announced warning")
	}
	s, _, _ = Apply(s, Command{Type: "tick"}, time.UnixMilli(102100))
	if e := dragon(t, &s); e.Breath != nil || e.NextBreathAt != 0 || s.HP != 100 {
		t.Fatalf("retreat did not end encounter: %+v", e)
	}
	s.Position = CatalogData.World.Spawn
	s, _, _ = Apply(s, Command{Type: "tick"}, time.UnixMilli(104500))
	if dragon(t, &s).Breath != nil || s.HP != 100 {
		t.Fatal("dragon attacked camp")
	}
}

func TestDragonEngagementBoundaryAndAimAtOrigin(t *testing.T) {
	for _, tc := range []struct {
		position Point
		warning  bool
	}{
		{Point{1355, 440}, true}, {Point{1355, 440.001}, false}, {Point{1355, 200}, true},
	} {
		s := New(time.UnixMilli(100000))
		s.Position = tc.position
		s, _, err := Apply(s, Command{Type: "tick"}, time.UnixMilli(100000))
		b := dragon(t, &s).Breath
		if err != nil || (b != nil) != tc.warning {
			t.Fatalf("engagement at %+v: %+v, %v", tc.position, b, err)
		}
		if b != nil && b.Aim == b.Origin {
			t.Fatal("warning direction at dragon origin is undefined")
		}
	}
}

func TestDragonDeathRewardsOnceAndRespawns(t *testing.T) {
	s := New(time.UnixMilli(100000))
	s.Position = Point{1355, 300}
	dragon(t, &s).HP = 12
	s, event, err := Apply(s, Command{Type: "attack", Target: "cinderwing"}, time.UnixMilli(100000))
	if err != nil || event != "dragon_defeat" || s.Gold != 180 || s.Inventory["ember"] != 3 || s.Kills != 0 || s.Level != 2 || s.XP != 20 || s.HP != 110 {
		t.Fatalf("dragon rewards: %+v event %s, %v", s, event, err)
	}
	if e := dragon(t, &s); e.HP != 0 || e.RespawnAt != 160000 || e.Breath != nil {
		t.Fatal("dragon death not persisted")
	}
	before := Clone(s)
	if _, _, err := Apply(s, Command{Type: "attack", Target: "cinderwing"}, time.UnixMilli(101000)); err == nil || !reflect.DeepEqual(s, before) {
		t.Fatal("dead dragon granted duplicate reward")
	}
	s, _, _ = Apply(s, Command{Type: "tick"}, time.UnixMilli(159999))
	if dragon(t, &s).HP != 0 {
		t.Fatal("dragon respawned early")
	}
	s, _, _ = Apply(s, Command{Type: "tick"}, time.UnixMilli(160000))
	if e := dragon(t, &s); e.HP != 240 || e.RespawnAt != 0 || e.Breath == nil || e.Breath.StartsAt != 161400 || s.Gold != 180 {
		t.Fatalf("dragon failed to respawn with a fresh warning: %+v", e)
	}
}

func TestDragonUsesFireInsteadOfSlimeRetaliation(t *testing.T) {
	s := New(time.UnixMilli(100000))
	s.Position = Point{1355, 300}
	s, _, err := Apply(s, Command{Type: "attack", Target: "cinderwing"}, time.UnixMilli(100000))
	if err != nil || s.HP != 100 || dragon(t, &s).HP != 228 || dragon(t, &s).Breath == nil {
		t.Fatalf("dragon strike used slime retaliation: %+v, %v", s, err)
	}
}

func TestActiveFireSurvivesLethalStrikeAndRescuesHero(t *testing.T) {
	s := encounter(t)
	s.HP = 20
	s.Gold = 81
	s.NextLevelXP = 1000
	dragon(t, &s).HP = 12
	s, event, err := Apply(s, Command{Type: "attack", Target: "cinderwing"}, time.UnixMilli(101400))
	if err != nil || event != "rescue" || s.HP != 100 || s.Mana != 60 || s.Position != CatalogData.World.Spawn || s.LastMoveAt != 101400 || s.Gold != 163 || s.Inventory["ember"] != 3 || s.Inventory["potion"] != 3 {
		t.Fatalf("lethal strike bypassed fire/rescue: %+v, event %s, %v", s, event, err)
	}
	if e := dragon(t, &s); e.HP != 0 || e.Breath != nil || e.NextBreathAt != 0 {
		t.Fatal("rescue left active fire behind")
	}
}

func TestFireRescueStopsLivingDragon(t *testing.T) {
	s := encounter(t)
	s.HP = 1
	s.Gold = 81
	s.Mana = 1
	s, event, err := Apply(s, Command{Type: "tick"}, time.UnixMilli(101400))
	if err != nil || event != "rescue" || s.Gold != 73 || s.HP != 100 || s.Mana != 60 || s.Position != CatalogData.World.Spawn || dragon(t, &s).Breath != nil {
		t.Fatalf("fire rescue: %+v event %s, %v", s, event, err)
	}
}

func TestInvalidCommandsDoNotAdvanceFire(t *testing.T) {
	for _, c := range []Command{{Type: "tick", Target: "cinderwing"}, {Type: "tick", X: ptr(1355)}, {Type: "tick", Version: -1}, {Type: "move", X: ptr(760), Y: ptr(540)}, {Type: "craft", Target: "flame_blade"}, {Type: "attack", Target: "missing"}} {
		s := encounter(t)
		before := Clone(s)
		returned, _, err := Apply(s, c, time.UnixMilli(101400))
		if err == nil || !reflect.DeepEqual(s, before) || !reflect.DeepEqual(returned, before) {
			t.Fatalf("rejected command changed active encounter: %+v, %v", c, err)
		}
	}
}

func TestOldSaveAcquiresDragonWithoutReset(t *testing.T) {
	now := time.Unix(100, 0)
	s := New(now)
	s.Enemies = s.Enemies[:3]
	s.Gold = 432
	s.Inventory["ember"] = 9
	s.Kills = 2
	updated, _, err := Apply(s, Command{Type: "rest"}, now)
	if err != nil || updated.Gold != 432 || updated.Inventory["ember"] != 9 || updated.Kills != 2 || len(updated.Enemies) != 4 {
		t.Fatalf("old save lost progress or missed encounter: %+v, %v", updated, err)
	}
}
