#!/usr/bin/env bash
# Prepare a detached checkout of a product revision that the product-path
# steps can run against: `.work/product/<sha>`. It reuses this checkout's
# installed node_modules by symlink, points the workspace packages at the
# detached sources, and builds `common` and `warehouses` there. Nothing is
# installed and no branch ref changes.
set -euo pipefail
sha=${1:?usage: product-checkout.sh <sha>}
fixture_root=$(cd -- "$(dirname -- "$0")/.." && pwd)
checkout_root=$(cd -- "$fixture_root/../.." && pwd)
target="$fixture_root/.work/product/$sha"
if [[ ! -d "$target" ]]; then
  git -C "$checkout_root" worktree add --detach "$target" "$sha" >/dev/null
fi
link_entries() {
  local source=$1 destination=$2
  mkdir -p "$destination"
  local entry name
  for entry in "$source"/* "$source"/.[!.]*; do
    [[ -e "$entry" ]] || continue
    name=$(basename "$entry")
    [[ "$name" == ".pnpm-task-run-state-v1" ]] && continue
    ln -sfn "$entry" "$destination/$name"
  done
}
link_entries "$checkout_root/node_modules" "$target/node_modules"
mkdir -p "$target/node_modules/.pnpm-task-run-state-v1"
for package in common warehouses backend; do
  source_modules="$checkout_root/packages/$package/node_modules"
  [[ -d "$source_modules" ]] || continue
  destination="$target/packages/$package/node_modules"
  if [[ -L "$destination" ]]; then rm "$destination"; fi
  link_entries "$source_modules" "$destination"
  rm -rf "$destination/@lightdash"
  mkdir -p "$destination/@lightdash"
  for dependency in "$source_modules"/@lightdash/*; do
    [[ -e "$dependency" ]] || continue
    name=$(basename "$dependency")
    if [[ -d "$target/packages/$name" ]]; then
      ln -sfn "$target/packages/$name" "$destination/@lightdash/$name"
    else
      ln -sfn "$dependency" "$destination/@lightdash/$name"
    fi
  done
done
cd "$target"
if [[ ! -f packages/common/dist/cjs/index.js || ! -f packages/warehouses/dist/index.js ]]; then
  pnpm -F common build
  pnpm -F warehouses build
fi
echo "$target"
