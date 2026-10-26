# Personal access token inventory

Run `pnpm -F backend inventory-personal-access-tokens --before <ISO timestamp> [--organization <uuid>] [--format json|csv]` with the server database configuration.
The command lists tokens created strictly before the timestamp, including expired or rotated tokens. It does not change or revoke them.
The server cannot tell which tokens were minted through OAuth. Descriptions do not establish token origin.
Organization membership is current, not historical. A token can appear under several organizations or none.
JSON includes a notice. CSV sends the notice to stderr. Both omit token hashes; keep the account metadata private.
See the [command README](../packages/backend/src/scripts/inventory-personal-access-tokens/README.md) for output details.
