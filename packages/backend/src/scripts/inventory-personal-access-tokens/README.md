# Personal access token inventory

Run from the repository root with the server database configuration:

```sh
pnpm -F backend inventory-personal-access-tokens --before 2026-10-26T00:00:00Z [--organization <uuid>] [--format json|csv]
```

The timestamp must include a timezone. JSON is the default format. JSON includes a `notice` and a `tokens` array. CSV writes the notice to stderr and the table to stdout.

The command reads tokens created strictly before the cutoff. It does not filter by description, expiry, rotation or last use. It never prints token hashes, updates records, deletes records or revokes tokens.

The server cannot tell which tokens were minted through OAuth. This is an inventory for review, not a list of compromised credentials. Organization membership is current, not historical. Each token appears once per current organization membership. Tokens without a membership have a null organization UUID unless an organization filter is supplied.

Treat the output as sensitive account metadata. See the [operator guide](../../../../../docs/personal-access-token-inventory.md).
