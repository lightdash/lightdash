#!/usr/bin/env bash
set -euo pipefail

# Temporary Debian 12 (Bookworm) backport for CVE-2026-48962 in File::GlobMapper,
# bundled with IO::Compress in perl-modules-5.36. Rebuild the matching Perl
# package set; +lightdash1 identifies our patched revision of Perl 5.36.0.
# https://security-tracker.debian.org/tracker/CVE-2026-48962
# https://github.com/pmqs/IO-Compress/commit/f2db247bf90d4cc7ee2710be384946081f3b4610
#
# This pinned backport requires maintenance; it does not automatically adopt
# Debian's future fix. Once Debian publishes a confirmed fixed Bookworm package,
# remove this directory and its RUN hooks in dockerfile and dockerfile-prs,
# install the official package through APT, and update the package-version and
# file-checksum assertions in .github/workflows/docker-build-test.yml.
# Also remove this backport when migrating to Debian 13 (Trixie) with Perl
# >= 5.40.1-6+deb13u1, updating those checks for the official package. Confirm the
# installed package includes the fix; changing the Debian release alone is
# insufficient.
readonly perl_version='5.36.0-7+deb12u3'
readonly backport_version='5.36.0-7+deb12u3+lightdash1'
readonly -a perl_packages=(perl-base perl perl-modules-5.36 libperl5.36)
patch_file="$(dirname "$(realpath "$0")")/globmapper.patch"
readonly patch_file
work_dir="$(mktemp -d /tmp/perl-backport.XXXXXX)"

# Preserve the base image's packages and APT configuration while building.
dpkg-query -W -f='${binary:Package}\n' > "$work_dir/original-packages"
apt-mark showmanual > "$work_dir/manual-packages"
cp /etc/apt/sources.list.d/debian.sources "$work_dir/debian.sources"

sed -i 's/^Types: deb$/Types: deb deb-src/' /etc/apt/sources.list.d/debian.sources
apt-get update
apt-get install -y --no-install-recommends build-essential dpkg-dev
apt-get build-dep -y --no-install-recommends "perl=${perl_version}"

cd "$work_dir"
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
apt-get install -y --no-install-recommends \
    "$work_dir"/perl-base_*.deb "$work_dir"/perl-modules-5.36_*.deb \
    "$work_dir"/libperl5.36_*.deb "$work_dir"/perl_*.deb

# Remove build-only dependencies without removing any original base packages.
apt-mark auto '.*' > /dev/null
xargs -r apt-mark manual < "$work_dir/original-packages" > /dev/null
apt-mark manual "${perl_packages[@]}" > /dev/null
apt-get autoremove -y --purge -o APT::AutoRemove::RecommendsImportant=false
apt-mark auto '.*' > /dev/null
xargs -r apt-mark manual < "$work_dir/manual-packages" > /dev/null
apt-mark manual "${perl_packages[@]}" > /dev/null
cp "$work_dir/debian.sources" /etc/apt/sources.list.d/debian.sources
apt-get clean
cd /
rm -rf "$work_dir" /var/lib/apt/lists/*

for package in "${perl_packages[@]}"; do
    version="$(dpkg-query -W -f='${Version}' "$package")"
    echo "$package $version"
    test "$version" = "$backport_version"
done
echo '78ba0fce947e6b09da9009b4bb5bc86e23d482ec6a7518b64b89c27f76f03bb5  /usr/share/perl/5.36.0/File/GlobMapper.pm' | sha256sum --check
