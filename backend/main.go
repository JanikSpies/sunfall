package main

import "time"

const targetFPS = 60

func main() {
	run()
}

func run() {
	ticker := time.NewTicker(time.Second / targetFPS)
	defer ticker.Stop()

	last := time.Now()
	for range ticker.C {
		now := time.Now()
		delta := now.Sub(last).Seconds()
		last = now

		// update(delta)
		// render()
		println(delta)
	}
}
