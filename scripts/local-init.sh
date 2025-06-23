#!/bin/bash

set -e 

echo "🏗️  Building the project..."
./scripts/build.sh

echo "🌱 Seeding the Jaffle database..."
./scripts/seed-jaffle.sh

echo "🔄 Migrating the database..."
./scripts/migrate.sh

echo "⚡️ Seeding the Lightdash database..."
./scripts/seed-lightdash.sh