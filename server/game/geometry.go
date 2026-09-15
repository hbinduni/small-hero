package game

import "math"

func dist(a, b Point) float64 { return math.Hypot(a.X-b.X, a.Y-b.Y) }
func Inside(p Point) bool {
	poly := CatalogData.World.Polygon
	inside := false
	for i, a := range poly {
		b := poly[(i+1)%len(poly)]
		cross := (p.X-a.X)*(b.Y-a.Y) - (p.Y-a.Y)*(b.X-a.X)
		if math.Abs(cross) < 1e-7 && p.X >= math.Min(a.X, b.X) && p.X <= math.Max(a.X, b.X) && p.Y >= math.Min(a.Y, b.Y) && p.Y <= math.Max(a.Y, b.Y) {
			return true
		}
		if (a.Y > p.Y) != (b.Y > p.Y) && p.X < (b.X-a.X)*(p.Y-a.Y)/(b.Y-a.Y)+a.X {
			inside = !inside
		}
	}
	return inside
}
func validSegment(a, b Point) bool {
	if !Inside(a) || !Inside(b) {
		return false
	}
	poly := CatalogData.World.Polygon
	ts := []float64{0, 1}
	dx, dy := b.X-a.X, b.Y-a.Y
	for i, p := range poly {
		q := poly[(i+1)%len(poly)]
		ex, ey := q.X-p.X, q.Y-p.Y
		den := dx*ey - dy*ex
		if math.Abs(den) < 1e-9 {
			continue
		}
		t := ((p.X-a.X)*ey - (p.Y-a.Y)*ex) / den
		u := ((p.X-a.X)*dy - (p.Y-a.Y)*dx) / den
		if t > 0 && t < 1 && u >= 0 && u <= 1 {
			ts = append(ts, t)
		}
	}
	for _, t := range ts {
		for _, u := range ts {
			if t < u && !Inside(Point{a.X + dx*(t+u)/2, a.Y + dy*(t+u)/2}) {
				return false
			}
		}
	}
	return true
}
