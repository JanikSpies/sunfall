package game

func (g *Game) SetPlayerInput(
	player *Player,
	inputX int8,
	inputY int8,
	dash bool,
) {
	g.mu.Lock()
	defer g.mu.Unlock()

	if !player.Alive {
		return
	}

	player.InputX = inputX
	player.InputY = inputY

	if dash {
		player.DashRequested = true
	}
}
