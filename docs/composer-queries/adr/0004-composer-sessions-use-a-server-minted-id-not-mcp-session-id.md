# Composer sessions use a server-minted id, not Mcp-Session-Id

On the MCP server, the `query` tool reuses nodes across calls through a
composer session: the first submission without a `sessionId` gets one minted
by the server and returned in its result, the tool description tells the
client that passing it back reuses earlier nodes and returns results faster,
and the server stores the session's owning user and project. Nodes live in
`composer_query_nodes` under `scope_type = 'mcp_session'`, which ADR 0001's
scoped key already allows without a migration. The transport's
`Mcp-Session-Id` was rejected: the MCP 2026-07-28 specification removed it
(SEP-2567) in favour of tool-minted handles passed back as arguments, our
transport treats it as an analytics token never bound to a user, and clients
on the 2025 transport echo it unreliably. A client-invented id was rejected because,
without a server-side owner, anyone who knew or guessed it could read another
user's node definitions; storing an owner makes it no simpler than minting.
An unknown, foreign or other-project `sessionId` fails with an error telling
the client to omit it, rather than silently starting a new session, because a
fresh session would break the client's node references with no visible
cause. Because every call without an id mints a session, sessions expire
after 24 hours idle and a scheduler deletes them with their nodes; thread
scopes never expire.
