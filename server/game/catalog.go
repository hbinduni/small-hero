package game

var CatalogData = Catalog{
	Items: []Item{
		{ID: "rusty_sword", Name: "Rusty sword", Kind: "weapon", Rarity: "common", Description: "A dependable old blade.", Attack: 12},
		{ID: "iron_sword", Name: "Iron sword", Kind: "weapon", Rarity: "uncommon", Description: "Forged at the village smithy.", Attack: 22},
		{ID: "flame_blade", Name: "Flame blade", Kind: "weapon", Rarity: "rare", Description: "A blade alive with ember light.", Attack: 38},
		{ID: "wood", Name: "Timber", Kind: "material", Rarity: "common", Description: "Seasoned forest timber."},
		{ID: "iron", Name: "Iron ore", Kind: "material", Rarity: "common", Description: "Ore from the clearing."},
		{ID: "ember", Name: "Ember shard", Kind: "material", Rarity: "uncommon", Description: "A warm fragment left by moss slimes and Cinderwing."},
		{ID: "potion", Name: "Healing potion", Kind: "consumable", Rarity: "common", Description: "Restores 45 health.", Heal: 45},
	},
	Recipes: []Recipe{
		{ID: "iron_sword", Result: "iron_sword", Cost: map[string]int{"wood": 3, "iron": 4}, Gold: 20, RequiredLevel: 1},
		{ID: "flame_blade", Result: "flame_blade", Cost: map[string]int{"iron_sword": 1, "iron": 6, "ember": 3}, Gold: 50, RequiredLevel: 1},
	},
	World: World{
		Width: 1536, Height: 1024, Speed: 220,
		Polygon: []Point{{440, 400}, {650, 335}, {1050, 390}, {1200, 290}, {1330, 70}, {1440, 80}, {1400, 345}, {1240, 470}, {1360, 650}, {1440, 730}, {1360, 820}, {1170, 620}, {1090, 660}, {730, 670}, {550, 570}, {435, 575}},
		Spawn:   Point{760, 540}, Smithy: Point{600, 370},
	},
}
