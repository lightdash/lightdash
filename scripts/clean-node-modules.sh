#!/bin/bash

rm -rf node_modules
find packages -name node_modules -type d -prune -exec rm -rf {} +

echo "🧼 cleaned \"node_modules\""
