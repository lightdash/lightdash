#!/bin/sh
# Run inside a Trixie image; package floors come from Debian's CVE-2026-48962 tracker.
set -eu

. /etc/os-release
[ "$ID" = debian ] && [ "$VERSION_ID" = 13 ]

check_package() {
    package=$1
    minimum=$2
    [ "$(dpkg-query -W -f='${db:Status-Status}' "$package")" = installed ]
    version=$(dpkg-query -W -f='${Version}' "$package")
    printf '%s\t%s\n' "$package" "$version"
    dpkg --compare-versions "$version" ge "$minimum"
}

for package in perl perl-base perl-modules-5.40 libperl5.40; do
    check_package "$package" '5.40.1-6+deb13u1'
done

packages=perl-modules-5.40
if [ "$(dpkg-query -W -f='${db:Status-Status}' libio-compress-perl 2>/dev/null || true)" = installed ]; then
    check_package libio-compress-perl '2.213-1+deb13u1'
    packages="$packages libio-compress-perl"
else
    echo 'libio-compress-perl: not installed'
fi

verified_modules=""
for package in $packages; do
    module=$(dpkg-query -L "$package" | grep '/File/GlobMapper.pm$')
    [ -n "$module" ]
    checksum=$(awk -v path="${module#/}" '$2 == path { print }' "$(dpkg-query --control-path "$package" md5sums)")
    [ -n "$checksum" ]
    (cd / && printf '%s\n' "$checksum" | md5sum --check)
    sha256sum "$module"
    verified_modules="$verified_modules $(readlink -f "$module")"
    perl - "$module" <<'PERL'
use strict;
use warnings;
use File::Temp qw(tempdir);
require $ARGV[0];
my $dir = tempdir(CLEANUP => 1);
chdir $dir or die $!;
open(my $file, '>', 'input.txt') or die $!;
close $file or die $!;
our $executed = 0;
my $output = q{"; $main::executed = 1; #};
my $map = File::GlobMapper::globmap('*.txt', $output);
die "Output glob executed Perl\n" if $executed;
die "Output glob was not preserved literally\n" unless $map && $map->[0][1] eq $output;
$map = File::GlobMapper::globmap('*put.txt', 'out-#1.txt');
die "Capture mapping failed\n" unless $map && $map->[0][1] eq 'out-in.txt';
$map = File::GlobMapper::globmap('*put.txt', 'out-\\#1\\*.txt');
die "Escaping failed\n" unless $map && $map->[0][1] eq 'out-#1*.txt';
print "GlobMapper literal output, capture mapping and escaping: PASS ($ARGV[0])\n";
PERL
done

active_module=$(perl -MFile::GlobMapper -e 'print $INC{q(File/GlobMapper.pm)}')
active_module=$(readlink -f "$active_module")
case "$verified_modules " in
    *" $active_module "*) printf 'Active verified module: %s\n' "$active_module" ;;
    *) printf 'Unverified active module: %s\n' "$active_module" >&2; exit 1 ;;
esac
