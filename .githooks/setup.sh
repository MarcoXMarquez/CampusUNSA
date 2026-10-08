#!/usr/bin/env bash
# Setup Git Hooks for Linux / macOS / WSL
git config core.hooksPath .githooks
chmod +x .githooks/pre-commit
echo "CampusUNSA Git hooks successfully enabled (.githooks)"
