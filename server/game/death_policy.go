package game

// GoldLostOnDefeat controls the camp rescue penalty. Items are always retained.
func GoldLostOnDefeat(gold int) int { return gold / 10 }
