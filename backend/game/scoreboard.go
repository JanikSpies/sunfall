package game

import "sort"

type ScoreboardEntry struct {
	ID     uint16
	Name   string
	Energy float32
}

func (g *Game) updateScoreboardLocked() {
	entries := make([]ScoreboardEntry, 0, len(g.Players))

	for _, player := range g.Players {
		if !player.Alive {
			continue
		}

		entries = append(entries, ScoreboardEntry{
			ID:     player.ID,
			Name:   player.Name,
			Energy: player.Energy,
		})
	}

	sort.Slice(entries, func(i, j int) bool {
		if entries[i].Energy != entries[j].Energy {
			return entries[i].Energy > entries[j].Energy
		}

		return entries[i].ID < entries[j].ID
	})

	g.Scoreboard = entries
}
