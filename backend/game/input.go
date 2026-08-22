package game

func (g *Game) SetPlayerInput(player *Player, inputX, inputY int8) {
	g.mu.Lock()
	defer g.mu.Unlock()

	if !player.Alive {
		return
	}

	player.InputX = inputX
	player.InputY = inputY
}

func (g *Game) RequestDash(player *Player) {
	g.mu.Lock()
	defer g.mu.Unlock()

	if !player.Alive {
		return
	}

	player.DashRequested = true
}
