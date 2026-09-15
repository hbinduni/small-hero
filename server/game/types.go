package game

type Point struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
}
type Enemy struct {
	ID           string  `json:"id"`
	Kind         string  `json:"kind"`
	Name         string  `json:"name"`
	X            float64 `json:"x"`
	Y            float64 `json:"y"`
	HP           int     `json:"hp"`
	MaxHP        int     `json:"maxHp"`
	RespawnAt    int64   `json:"respawnAt"`
	NextBreathAt int64   `json:"nextBreathAt"`
	Breath       *Breath `json:"breath,omitempty"`
}
type Breath struct {
	Origin   Point `json:"origin"`
	Aim      Point `json:"aim"`
	StartsAt int64 `json:"startsAt"`
	EndsAt   int64 `json:"endsAt"`
	Hit      bool  `json:"hit"`
}
type Node struct {
	ID      string  `json:"id"`
	X       float64 `json:"x"`
	Y       float64 `json:"y"`
	ReadyAt int64   `json:"readyAt"`
}
type State struct {
	Version      int64          `json:"version"`
	Name         string         `json:"name"`
	Level        int            `json:"level"`
	XP           int            `json:"xp"`
	NextLevelXP  int            `json:"nextLevelXp"`
	HP           int            `json:"hp"`
	MaxHP        int            `json:"maxHp"`
	Mana         int            `json:"mana"`
	MaxMana      int            `json:"maxMana"`
	Gold         int            `json:"gold"`
	Inventory    map[string]int `json:"inventory"`
	Equipped     string         `json:"equipped"`
	Position     Point          `json:"position"`
	Kills        int            `json:"kills"`
	Crafted      int            `json:"crafted"`
	QuestClaimed bool           `json:"questClaimed"`
	Enemies      []Enemy        `json:"enemies"`
	Nodes        []Node         `json:"nodes"`
	LastActionAt int64          `json:"lastActionAt"`
	LastMoveAt   int64          `json:"lastMoveAt"`
	LastAttackAt int64          `json:"lastAttackAt"`
}
type Command struct {
	ID      string   `json:"id"`
	Version int64    `json:"version"`
	Type    string   `json:"type"`
	Target  string   `json:"target,omitempty"`
	X       *float64 `json:"x,omitempty"`
	Y       *float64 `json:"y,omitempty"`
}
type Item struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Kind        string `json:"kind"`
	Rarity      string `json:"rarity"`
	Description string `json:"description"`
	Attack      int    `json:"attack,omitempty"`
	Heal        int    `json:"heal,omitempty"`
}
type Recipe struct {
	ID            string         `json:"id"`
	Result        string         `json:"result"`
	Cost          map[string]int `json:"cost"`
	Gold          int            `json:"gold"`
	RequiredLevel int            `json:"requiredLevel"`
}
type World struct {
	Width   int     `json:"width"`
	Height  int     `json:"height"`
	Speed   int     `json:"speed"`
	Polygon []Point `json:"polygon"`
	Spawn   Point   `json:"spawn"`
	Smithy  Point   `json:"smithy"`
}
type Catalog struct {
	Items   []Item   `json:"items"`
	Recipes []Recipe `json:"recipes"`
	World   World    `json:"world"`
}
type Response struct {
	ServerTime int64   `json:"serverTime"`
	State      State   `json:"state"`
	Catalog    Catalog `json:"catalog"`
	Message    string  `json:"message"`
	Event      string  `json:"event,omitempty"`
}
