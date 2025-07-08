{
  description = "Nix flake for Lightdash development environment";

  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs/nixos-unstable";
  };

  outputs =
    { self, nixpkgs }:
    let
      # This covers typical Linux and macOS architectures.
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
            config = { };
          };

          # Python version to use for venvs
          python312 = pkgs.python312;

          # Base directory for all DBT virtual environments
          dbtVenvsBaseDir = ".venvs/dbt";
          dbtAliasesDir = ".venvs/bin"; # Centralized location for all dbt aliases

          # Define the dbt versions to set up automatically
          # Using versions from dockerfile
          dbtVersions = {
            dbt1_4 = {
              dbtCoreVersion = "1.4.9";
              dbtAliasName = "dbt";
              adapterVersions = {
                postgres = "1.4.9";
                redshift = "1.4.1";
                snowflake = "1.4.5";
                bigquery = "1.4.5";
                databricks = "1.4.3";
                trino = "1.4.2";
              };
            };
            dbt1_5 = {
              dbtCoreVersion = "1.5.0";
              dbtAliasName = "dbt1.5";
              adapterVersions = {
                postgres = "1.5.11";
                redshift = "1.5.12";
                snowflake = "1.5.7";
                bigquery = "1.5.9";
                databricks = "1.5.7";
                trino = "1.5.1";
              };
            };
            dbt1_6 = {
              dbtCoreVersion = "1.6.0";
              dbtAliasName = "dbt1.6";
              adapterVersions = {
                postgres = "1.6.0";
                redshift = "1.6.0";
                snowflake = "1.6.0";
                bigquery = "1.6.0";
                databricks = "1.6.0";
                trino = "1.6.0";
              };
            };
            dbt1_7 = {
              dbtCoreVersion = "1.7.0";
              dbtAliasName = "dbt1.7";
              adapterVersions = {
                postgres = "1.7.0";
                redshift = "1.7.0";
                snowflake = "1.7.0";
                bigquery = "1.7.0";
                databricks = "1.7.0";
                trino = "1.7.0";
              };
            };
            dbt1_8 = {
              dbtCoreVersion = "1.8.0";
              dbtAliasName = "dbt1.8";
              adapterVersions = {
                postgres = "1.8.0";
                redshift = "1.8.0";
                snowflake = "1.8.0";
                bigquery = "1.8.0";
                databricks = "1.8.0";
                trino = "1.8.0";
              };
            };
            dbt1_9 = {
              dbtCoreVersion = "1.9.0";
              dbtAliasName = "dbt1.9";
              adapterVersions = {
                postgres = "1.9.0";
                redshift = "1.9.0";
                snowflake = "1.9.0";
                bigquery = "1.9.0";
                databricks = "1.9.0";
                trino = "1.9.0";
              };
            };
          };

          # Helper function to create a dbt virtual environment and its alias
          # Arguments are now a single attribute set for easier use with mapAttrsToList
          mkDbtVenvSetup =
            {
              dbtCoreVersion,
              dbtAliasName,
              adapterVersions,
            }:
            ''
              # Path to the venv, relative to project root
              VENV_PATH="${dbtVenvsBaseDir}/${dbtCoreVersion}"
              # Path to the dbt executable, relative to project root (for checks)
              DBT_BIN_FROM_ROOT="$VENV_PATH/bin/dbt"
              # Path to the alias file, relative to project root
              ALIAS_PATH="${dbtAliasesDir}/${dbtAliasName}"
              # Path to the dbt executable, relative to the alias's directory (for the symlink)
              DBT_BIN_FOR_LINK="../dbt/${dbtCoreVersion}/bin/dbt"

              # Ensure directories exist (these are relative to project root)
              mkdir -p ${pkgs.lib.escapeShellArg dbtVenvsBaseDir}
              mkdir -p ${pkgs.lib.escapeShellArg dbtAliasesDir}

              if [ ! -d "$VENV_PATH" ]; then
                echo "Setting up dbt ${dbtCoreVersion} virtual environment in $VENV_PATH..."
                # Create the venv using the Nix-provided python
                ${python312}/bin/python3 -m venv "$VENV_PATH" || { echo "Failed to create venv"; exit 1; }

                # Activate for pip install (temporary activation for the script)
                source "$VENV_PATH/bin/activate"

                echo "Installing dbt-core==${dbtCoreVersion} and all adapters..."

                # Install dbt-core first (required for 1.8+)
                pip install "dbt-core==${dbtCoreVersion}" --disable-pip-version-check --no-warn-script-location || { echo "Failed to install dbt-core"; exit 1; }

                # Install all adapters
                pip install \
                  "dbt-postgres~=${adapterVersions.postgres}" \
                  "dbt-redshift~=${adapterVersions.redshift}" \
                  "dbt-snowflake~=${adapterVersions.snowflake}" \
                  "dbt-bigquery~=${adapterVersions.bigquery}" \
                  "dbt-databricks~=${adapterVersions.databricks}" \
                  "dbt-trino~=${adapterVersions.trino}" \
                  "pytz" \
                  "psycopg2-binary==2.9.6" \
                  --disable-pip-version-check --no-warn-script-location || { echo "Failed to install adapters"; exit 1; }

                deactivate # Deactivate after installation

                echo "dbt ${dbtCoreVersion} venv setup complete with all adapters."
              fi

              # Create/update the symlink for the alias using the correct relative path
              if [ -f "$DBT_BIN_FROM_ROOT" ]; then
                ln -sf "$DBT_BIN_FOR_LINK" "$ALIAS_PATH"
              else
                echo "WARNING: dbt executable not found in $VENV_PATH. Alias '${dbtAliasName}' might not work."
              fi
            '';

          # Programmatically generate the setup scripts for all defined dbt versions
          dbtSetupScripts = pkgs.lib.concatStringsSep "\n\n" (
            pkgs.lib.mapAttrsToList (name: versionInfo: mkDbtVenvSetup versionInfo) dbtVersions
          );

          # Programmatically generate the list of aliases for the help message
          dbtAliasList = pkgs.lib.concatStringsSep ", " (
            pkgs.lib.attrNames (
              pkgs.lib.mapAttrs' (name: value: {
                name = value.dbtAliasName;
                value = null;
              }) dbtVersions
            )
          );

        in
        {
          default = pkgs.mkShell {
            name = "lightdash-dev-shell";

            # Essential build tools for native Node.js modules
            nativeBuildInputs = with pkgs; [
              gcc
              gnumake
              pkg-config
              libpq
              libpq.pg_config
              openssl
            ];

            buildInputs = with pkgs; [
              nodejs_22
              pnpm

              # for dbt
              python312
              postgresql

              cloudflared

              git-secrets

              google-cloud-sdk
              kubectl
              okteto
            ];

            # Environment setup
            shellHook = ''
              echo ""
              echo "------------------------------------------------------"
              echo "Entering Lightdash development shell for ${system}..."
              echo "NODE: $(node --version)"
              echo "PNPM: $(pnpm --version)"

              # This single variable now expands to all the setup scripts
              ${dbtSetupScripts}

              # Add the alias directory to the PATH to make dbt commands directly available
              export PATH="$PWD/${dbtAliasesDir}:$PATH"

              echo "Available DBT commands: ${dbtAliasList}"
              echo  "------------------------------------------------------"
              echo  ""
            '';
          };
        }
      );
    };
}
