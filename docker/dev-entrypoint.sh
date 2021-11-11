#!/bin/bash
set -e

# Install dependencies
yarn install
yarn common-build

# Seed database with development data and jaffle shop demo
./seed.sh

# Run dev enviroment
exec yarn dev
