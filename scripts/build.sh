#!/bin/bash
set -e

yarn install
yarn common-build
yarn warehouses-build
yarn cli-build
