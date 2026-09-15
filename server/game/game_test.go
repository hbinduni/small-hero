package game

import (
	"reflect"
	"testing"
	"time"
)

func TestRejectsUnchanged(t *testing.T) {
	now := time.Unix(100, 0)
	for _, c := range []Command{{Type: "equip", Target: "flame_blade"}, {Type: "craft", Target: "flame_blade"}, {Type: "attack", Target: "moss-3"}, {Type: "move", X: ptr(1400), Y: ptr(80)}, {Type: "claim"}} {
		s := New(now)
		before := Clone(s)
		_, _, err := Apply(s, c, now)
		if err == nil {
			t.Fatalf("accepted %+v", c)
		}
		if !reflect.DeepEqual(s, before) {
			t.Fatal("mutated rejected state")
		}
	}
}
func ptr(v float64) *float64 { return &v }
func TestCooldownDeathQuest(t *testing.T) {
	now := time.Unix(100, 0)
	s := New(now)
	s.Position = Point{950, 470}
	s.HP = 1
	s.Gold = 81
	dead, _, err := Apply(s, Command{Type: "attack", Target: "moss-1"}, now)
	if err != nil || dead.HP != 100 || dead.Gold != 73 || dead.Position != CatalogData.World.Spawn {
		t.Fatalf("death: %+v %v", dead, err)
	}
	_, _, err = Apply(dead, Command{Type: "attack", Target: "moss-1"}, now)
	if err == nil {
		t.Fatal("cooldown accepted")
	}
	s.Position = CatalogData.World.Smithy
	s.Crafted = 1
	s.Kills = 3
	s.Inventory["flame_blade"] = 1
	s, _, err = Apply(s, Command{Type: "claim"}, now)
	if err != nil {
		t.Fatal(err)
	}
	_, _, err = Apply(s, Command{Type: "claim"}, now)
	if err == nil {
		t.Fatal("quest replay")
	}
}
func TestCraftAtomicAndEquipConsumed(t *testing.T) {
	now := time.Unix(100, 0)
	s := New(now)
	s.Position = CatalogData.World.Smithy
	s.Inventory["wood"] = 3
	s.Inventory["iron"] = 4
	s.Gold = 19
	before := Clone(s)
	_, _, err := Apply(s, Command{Type: "craft", Target: "iron_sword"}, now)
	if err == nil || !reflect.DeepEqual(s, before) {
		t.Fatal("unaffordable craft changed state")
	}
	s.Gold = 80
	s, _, err = Apply(s, Command{Type: "craft", Target: "iron_sword"}, now)
	if err != nil || s.Gold != 60 || s.Inventory["wood"] != 0 || s.Inventory["iron"] != 0 || s.Inventory["iron_sword"] != 1 {
		t.Fatalf("craft: %+v %v", s, err)
	}
	s.Equipped = "iron_sword"
	s.Inventory["iron"] = 6
	s.Inventory["ember"] = 3
	s, _, err = Apply(s, Command{Type: "craft", Target: "flame_blade"}, now)
	if err != nil || s.Equipped != "flame_blade" || s.Inventory["iron_sword"] != 0 {
		t.Fatal("consumed equipped weapon")
	}
}
func TestCombatRegenerationAndMana(t *testing.T) {
	now := time.Unix(100, 0)
	s := New(now)
	s.Position = Point{950, 470}
	s.Mana = 14
	before := Clone(s)
	_, _, err := Apply(s, Command{Type: "heavy_attack", Target: "moss-1"}, now)
	if err == nil || !reflect.DeepEqual(before, s) {
		t.Fatal("mana rejection")
	}
	s.Mana = 60
	s, _, err = Apply(s, Command{Type: "heavy_attack", Target: "moss-1"}, now)
	if err != nil || s.Mana != 45 || s.Enemies[0].HP != 12 || s.HP != 92 {
		t.Fatal("heavy attack")
	}
	_, _, err = Apply(s, Command{Type: "attack", Target: "moss-1"}, now.Add(599*time.Millisecond))
	if err == nil {
		t.Fatal("cooldown")
	}
	s, _, err = Apply(s, Command{Type: "attack", Target: "moss-1"}, now.Add(600*time.Millisecond))
	if err != nil || s.Kills != 1 || s.XP != 30 || s.Inventory["ember"] != 1 {
		t.Fatal("kill rewards")
	}
	_, _, err = Apply(s, Command{Type: "attack", Target: "moss-1"}, now.Add(time.Second))
	if err == nil {
		t.Fatal("dead target")
	}
	s, _, err = Apply(s, Command{Type: "attack", Target: "moss-1"}, now.Add(15600*time.Millisecond))
	if err != nil || s.Enemies[0].HP != 24 {
		t.Fatal("respawn")
	}
}
func TestTravelBudgetAndPolygon(t *testing.T) {
	now := time.Unix(100, 0)
	s := New(now)
	s, _, err := Apply(s, Command{Type: "move", X: ptr(800), Y: ptr(540)}, now)
	if err != nil {
		t.Fatal(err)
	}
	_, _, err = Apply(s, Command{Type: "move", X: ptr(840), Y: ptr(540)}, now)
	if err == nil {
		t.Fatal("repeated movement gained tolerance")
	}
	if validSegment(Point{1200, 300}, Point{1390, 750}) {
		t.Fatal("segment exits concave polygon")
	}
	_, _, err = Apply(s, Command{Type: "move", X: ptr(-1), Y: ptr(540)}, now.Add(time.Hour))
	if err == nil {
		t.Fatal("outside polygon")
	}
}
func TestGatherCooldown(t *testing.T) {
	now := time.Unix(100, 0)
	s := New(now)
	s.Position = Point{1100, 560}
	s, _, err := Apply(s, Command{Type: "gather", Target: "wood"}, now)
	if err != nil || s.Inventory["wood"] != 2 {
		t.Fatal("gather")
	}
	_, _, err = Apply(s, Command{Type: "gather", Target: "wood"}, now.Add(7999*time.Millisecond))
	if err == nil {
		t.Fatal("early regeneration")
	}
	s, _, err = Apply(s, Command{Type: "gather", Target: "wood"}, now.Add(8*time.Second))
	if err != nil || s.Inventory["wood"] != 4 {
		t.Fatal("node regeneration")
	}
}

func TestDelayedMovementBurst(t *testing.T) {
	// Recorded server timestamps from a real client moving at the allowed speed.
	s := New(time.UnixMilli(1789454745840))
	s.Position = Point{877.073, 497.101}
	s.LastMoveAt = 1789454745658
	for _, step := range []struct {
		at    int64
		point Point
	}{
		{1789454747208, Point{953.814, 478.901}},
		{1789454747244, Point{1030.530, 460.706}},
		{1789454747280, Point{1082, 448}},
	} {
		var err error
		s, _, err = Apply(s, Command{Type: "move", X: ptr(step.point.X), Y: ptr(step.point.Y)}, time.UnixMilli(step.at))
		if err != nil {
			t.Fatalf("valid delayed move at %d rejected: %v", step.at, err)
		}
	}
}

func TestMovementBankIsBoundedAndCharged(t *testing.T) {
	start := time.Unix(100, 0)
	now := start.Add(time.Hour)
	s := New(start)
	if !validSegment(s.Position, Point{1241, 540}) {
		t.Fatal("test segment must be playable")
	}
	if _, _, err := Apply(s, Command{Type: "move", X: ptr(1241), Y: ptr(540)}, now); err == nil {
		t.Fatal("idle time allowed more than 2-second bank plus tolerance")
	}
	for _, x := range []float64{980, 1200, 1240} {
		var err error
		s, _, err = Apply(s, Command{Type: "move", X: ptr(x), Y: ptr(540)}, now)
		if err != nil {
			t.Fatalf("banked movement to %f rejected: %v", x, err)
		}
	}
	if _, _, err := Apply(s, Command{Type: "move", X: ptr(1241), Y: ptr(540)}, now); err == nil {
		t.Fatal("burst minted extra travel credit")
	}
}
