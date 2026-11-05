//go:build !linux

package main

// initPlatformPrgname is a no-op on non-Linux platforms
func initPlatformPrgname(name string) {}
