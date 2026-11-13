package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"
)

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	service, err := newWebsiteService()
	if err != nil {
		log.Fatal(err)
	}

	if err := service.Run(ctx); err != nil {
		log.Fatal(err)
	}
}
