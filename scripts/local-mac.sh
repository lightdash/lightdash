#!/bin/bash

set -e

# 1 Install Homebrew (https://brew.sh)
if ! command -v brew &> /dev/null; then
    echo "📦 Installing Homebrew..."
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
else
    echo "✅ Homebrew is already installed"
fi

brew update

# 2 Install nvm (https://github.com/nvm-sh/nvm#troubleshooting-on-macos) and other required dependencies

packages=(
  "nvm"
  "pkg-config"
  "cairo"
  "pango"
  "libpng"
  "jpeg"
  "giflib"
  "librsvg"
  "pixman"
  "python-setuptools"
  "postgresql@14"
)

brew install "${packages[@]}"

# 3 Install specified node version using NVM (https://github.com/nvm-sh/nvm)
nvm install v20.8.0
nvm alias default v20.8.0

# 4 Install postgres (https://wiki.postgresql.org/wiki/Homebrew) and pgvector
brew services start postgresql@14

# pgvector is an extension for postgres we use in Lightdash, it needs to be installed separately
# More info about this extension and a detailed installation guide available here: https://github.com/pgvector/pgvector
# on Linux, you can install `postgresql-14-pgvector`, available on apt
# You might need to point pgvector to a correct postgres instance if you have multiple versions installed
# export PG_CONFIG=/opt/homebrew/opt/postgresql@14/bin/pg_config
git clone --branch v0.8.0 https://github.com/pgvector/pgvector.git && cd pgvector && make && sudo make install && cd ..

# 5 Install dbt using pip
# Detailed installation guide available here: https://docs.getdbt.com/docs/core/pip-install
# Create python virtual env
python3 -m venv env-lightdash # or your preferred env name
# Activate the env
# You can deactivate python virtual env by running `deactivate` later
source env-lightdash/bin/activate

# DBT uses distutils which may not be installed by default
# Install `setuptools` to fix this and ensure distutils is available
if ! python -c "import distutils.util" 2>/dev/null; then
    echo "📦 distutils is not available, installing setuptools..."
    pip install setuptools
fi
python -m pip install dbt-postgres==1.4.9

# 6 Clone the repo and open it in your IDE
git clone https://github.com/lightdash/lightdash.git
cd lightdash

# 7 Copy `.env.development` to `.env.development.local`
cp .env.development .env.development.local

# 8 Edit some environment variables to match your setup
open .env.development.local -t

# 8.1 Update environment variables in .env.development.local
# You may need to edit the following variables:
# PGUSER=pg_user *OR* machine username if no prior postgres set up
# PGPASSWORD=pg_password *OR* blank if no prior postgres set up
# PGDATABASE=postgres
# Double check that these values .env.development.local are correct.
sed -i '' \
  -e "s/^PGHOST=.*/PGHOST=localhost/" \
  -e "s/^PGPORT=.*/PGPORT=5432/" \
  -e "s/^PGUSER=.*/PGUSER=$(whoami)/" \
  -e "s/^PGPASSWORD=.*/PGPASSWORD=/" \
  -e "s|^DBT_DEMO_DIR=.*|DBT_DEMO_DIR=$PWD/examples/full-jaffle-shop-demo|" \
  .env.development.local

# 9 Install packages
pnpm install

# 10 Build / migrate / seed
pnpm local-init

echo "🚀 Lightdash is ready to run! Run `pnpm load:env pnpm dev` to start the app."
