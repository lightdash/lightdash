#!/bin/bash
set -e

if ! test -f $PWD/yarn.lock; then
    echo "Script must run from the repository's root directory"
    exit 1
fi

if git remote | grep -q 'upstream'; then
    echo "Upstream already exists"
    exit 0
fi

git remote add upstream https://github.com/lightdash/lightdash.git
git fetch upstream