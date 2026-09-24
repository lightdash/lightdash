#!/usr/bin/env bash
set -euo pipefail

readonly perl_version='5.36.0-7+deb12u3'
readonly backport_version='5.36.0-7+deb12u3+lightdash1'
patch_file="$(dirname "$(realpath "$0")")/globmapper.patch"
readonly patch_file

# Rebuild Bookworm's packages with the upstream CVE-2026-48962 fix.
# https://github.com/pmqs/IO-Compress/commit/f2db247bf90d4cc7ee2710be384946081f3b4610
# Replace this backport with the official Bookworm update when available.
sed -i 's/^Types: deb$/Types: deb deb-src/' /etc/apt/sources.list.d/debian.sources
apt-get update
apt-get install -y --no-install-recommends build-essential dpkg-dev
apt-get build-dep -y --no-install-recommends "perl=${perl_version}"

mkdir -p /src
cd /src
apt-get source "perl=${perl_version}"
cd "perl-${perl_version%%-*}"

sed -e 's|a/lib/|a/cpan/IO-Compress/lib/|' \
    -e 's|b/lib/|b/cpan/IO-Compress/lib/|' \
    "$patch_file" > debian/patches/fixes/CVE-2026-48962.diff
echo 'fixes/CVE-2026-48962.diff' >> debian/patches/series
dpkg-source --before-build .
{
    printf 'perl (%s) bookworm; urgency=high\n\n  * Backport upstream fix for CVE-2026-48962.\n\n -- Lightdash <support@lightdash.com>  Thu, 24 Sep 2026 00:00:00 +0000\n\n' "$backport_version"
    cat debian/changelog
} > /tmp/changelog
mv /tmp/changelog debian/changelog

# Keep Debian's full package test suite enabled.
dpkg-buildpackage --build=binary --no-sign -j4
mkdir -p /packages
cp ../perl-base_*.deb ../perl-modules-5.36_*.deb ../libperl5.36_*.deb ../perl_*.deb /packages/
