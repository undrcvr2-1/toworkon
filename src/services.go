package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

type websiteService struct {
	directory string
	script    string
	port      string
	build     bool
}

func newWebsiteService() (*websiteService, error) {
	directory, err := findWebsiteDirectory()
	if err != nil {
		return nil, err
	}

	content, err := os.ReadFile(filepath.Join(directory, "package.json"))
	if err != nil {
		return nil, fmt.Errorf("could not read package.json: %w", err)
	}

	var manifest struct {
		Scripts map[string]string `json:"scripts"`
	}
	if err := json.Unmarshal(content, &manifest); err != nil {
		return nil, fmt.Errorf("could not read package.json: %w", err)
	}

	script := strings.TrimSpace(os.Getenv("NPM_SCRIPT"))
	if script == "" {
		for _, candidate := range []string{"start", "preview", "dev"} {
			if _, ok := manifest.Scripts[candidate]; ok {
				script = candidate
				break
			}
		}
	}
	if script == "" {
		return nil, fmt.Errorf("no start, preview, or dev script is defined in %s", filepath.Join(directory, "package.json"))
	}
	if _, ok := manifest.Scripts[script]; !ok {
		return nil, fmt.Errorf("npm script %q is not defined in package.json", script)
	}

	port := strings.TrimSpace(os.Getenv("PORT"))
	if port == "" {
		port = "3000"
	}

	_, hasBuild := manifest.Scripts["build"]

	return &websiteService{
		directory: directory,
		script:    script,
		port:      port,
		build:     hasBuild && script != "dev",
	}, nil
}

func findWebsiteDirectory() (string, error) {
	if configured := strings.TrimSpace(os.Getenv("WEBSITE_DIR")); configured != "" {
		directory, err := filepath.Abs(configured)
		if err != nil {
			return "", err
		}
		if _, err := os.Stat(filepath.Join(directory, "package.json")); err != nil {
			return "", fmt.Errorf("WEBSITE_DIR does not contain a package.json: %w", err)
		}
		return directory, nil
	}

	current, err := os.Getwd()
	if err != nil {
		return "", err
	}

	candidates := []string{
		filepath.Join(current, "src", "website"),
		filepath.Join(current, "website"),
	}

	if _, source, _, ok := runtime.Caller(0); ok {
		candidates = append(candidates, filepath.Join(filepath.Dir(source), "website"))
	}

	candidates = append(candidates, current)

	for _, candidate := range candidates {
		if _, err := os.Stat(filepath.Join(candidate, "package.json")); err == nil {
			return filepath.Abs(candidate)
		}
	}

	return "", fmt.Errorf("could not find the website package; set WEBSITE_DIR to the folder containing package.json")
}

func (s *websiteService) runNPM(ctx context.Context, args ...string) error {
	cmd := exec.CommandContext(ctx, "npm", args...)
	cmd.Dir = s.directory
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	cmd.Stdin = os.Stdin
	cmd.Env = append(os.Environ(), "HOST=0.0.0.0", "PORT="+s.port)
	return cmd.Run()
}

func (s *websiteService) Run(ctx context.Context) error {
	if _, err := exec.LookPath("npm"); err != nil {
		return fmt.Errorf("npm is not installed or is not available in PATH: %w", err)
	}

	installCommand := "install"
	if _, err := os.Stat(filepath.Join(s.directory, "package-lock.json")); err == nil {
		installCommand = "ci"
	}

	log.Printf("Installing website dependencies in %s", s.directory)
	if err := s.runNPM(ctx, installCommand); err != nil {
		if ctx.Err() != nil {
			return nil
		}
		return fmt.Errorf("npm %s failed: %w", installCommand, err)
	}

	if s.build {
		log.Printf("Building website")
		if err := s.runNPM(ctx, "run", "build"); err != nil {
			if ctx.Err() != nil {
				return nil
			}
			return fmt.Errorf("npm run build failed: %w", err)
		}
	}

	if err := ctx.Err(); err != nil {
		return nil
	}

	log.Printf("Starting website with npm run %s on port %s", s.script, s.port)
	delay := 2 * time.Second
	for {
		started := time.Now()
		err := s.runNPM(ctx, "run", s.script)
		if ctx.Err() != nil {
			return nil
		}
		if err != nil {
			log.Printf("Website process stopped: %v. Restarting in %s", err, delay)
		} else {
			log.Printf("Website process exited. Restarting in %s", delay)
		}

		timer := time.NewTimer(delay)
		select {
		case <-ctx.Done():
			if !timer.Stop() {
				select {
				case <-timer.C:
				default:
				}
			}
			return nil
		case <-timer.C:
		}

		if time.Since(started) > time.Minute {
			delay = 2 * time.Second
		} else if delay < 30*time.Second {
			delay *= 2
			if delay > 30*time.Second {
				delay = 30 * time.Second
			}
		}
	}
}
