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
        "x86_64-darwin"
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
              ];
            };
          };
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

              # for node-canvas
              pixman
              cairo
              pango
              libjpeg
              libpng
              librsvg
              giflib
            ];

            buildInputs = with pkgs; [
              nodejs_20
              corepack

              # for dbt
              python312
              postgresql

              jq
              cloudflared

              git-secrets

              google-cloud-sdk
              kubectl
              okteto

              graphite-cli
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
