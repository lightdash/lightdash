{
  description = "Nix flake for Lightdash development environment";

  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs/nixos-unstable";
  };

  outputs =
    { self, nixpkgs }:
    let
      supportedSystems = [
        "x86_64-linux"
        "aarch64-linux"
        "aarch64-darwin"
      ];

      forAllSystems = f: nixpkgs.lib.genAttrs supportedSystems (system: f system);
    in
    {
      devShells = forAllSystems (
        system:
        let
          pkgs = import nixpkgs {
            inherit system;
            config = {
              allowUnfreePredicate = pkg: builtins.elem (nixpkgs.lib.getName pkg) [
                "graphite-cli"
                "graphite-cli-unwrapped"
              ];
            };
          };

          # Socket Firewall Free — blocks malicious npm packages before they hit
          # disk. Not in nixpkgs, so fetch the released binary directly.
          #
          # Pinned rather than run through `npx -y sfw`: the npm package is only
          # a launcher that downloads this binary at run time, which left the
          # version unpinned, and npx reads this repo's package.json before
          # running anything, so its devEngines Node pin made sfw fail
          # everywhere inside the repo.
          #
          # Socket drops support for older binaries, so bump this periodically.
          # Linux uses the musl builds: they are static, so no autoPatchelf.
          sfwVersion = "1.15.2";

          sfwAsset =
            {
              x86_64-linux = {
                name = "sfw-free-musl-linux-x86_64";
                hash = "sha256-AHqXablSNdOIEYIuWZ/16CLZxGho0mO4K0KjHwOwBSw=";
              };
              aarch64-linux = {
                name = "sfw-free-musl-linux-arm64";
                hash = "sha256-E/Qy0mfJJGtNvXQUk+e0D6ccQIIj9++DYMjA/OHoEww=";
              };
              aarch64-darwin = {
                name = "sfw-free-macos-arm64";
                hash = "sha256-KMTRTtXbCeOj4pnAIDbdqlJMXEdsso4y3qxPdwkayss=";
              };
            }
            .${system};

          sfw =
            pkgs.runCommand "sfw-${sfwVersion}"
              {
                src = pkgs.fetchurl {
                  url = "https://github.com/SocketDev/sfw-free/releases/download/v${sfwVersion}/${sfwAsset.name}";
                  inherit (sfwAsset) hash;
                };
                meta = {
                  description = "Socket Firewall Free — blocks malicious packages during installs";
                  homepage = "https://github.com/SocketDev/sfw-free";
                  mainProgram = "sfw";
                };
              }
              ''
                install -Dm755 $src $out/bin/sfw
              '';
        in
        {
          default = pkgs.mkShell {
            name = "lightdash-dev-shell";

            nativeBuildInputs = with pkgs; [
              gcc
              gnumake
              pkg-config
              libpq
              libpq.pg_config
              openssl

              # for @databricks/sql
              lz4
            ];

            buildInputs = (with pkgs; [
              nodejs_24
              pnpm_12

              # for dbt
              python312
              postgresql

              jq
              cloudflared

              git-secrets

              google-cloud-sdk
              kubectl
              okteto

              natscli

              graphite-cli

              # for canvas native module
              expat
              zlib
              util-linux # libuuid
              xz # liblzma
            ]) ++ [ sfw ];

            env.LD_LIBRARY_PATH = pkgs.lib.makeLibraryPath [
              pkgs.expat
              pkgs.zlib
              pkgs.util-linux
              pkgs.xz
            ];

            shellHook = ''
              # Add dbt aliases to PATH
              export PATH="$PWD/.venvs/bin:$PATH"
              echo "⚡️ Entering Lightdash development shell for ${system}..."
            '';
          };
        }
      );
    };
}
