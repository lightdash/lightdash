# Warehouse connections

Vocabulary for the multi-connection projects effort. Release 1 (catalog visibility) ships on one connection per project. Release 2 lets a project hold several. Code, PR titles and tickets use these words.

## Glossary

- **Connection.** A named set of warehouse credentials attached to a project. Connections are equal: no primary, no secondary. A project with zero or one connection runs the same code path as a project with many. A `warehouse_credentials` row is one connection.
- **Project-owned connection.** Credentials live on the row. **Org connection.** The row points at an org-level credential. Nothing else distinguishes them.
- **Warehouse type.** One per project. Every connection shares it.
- **Additional databases.** Per connection: a `listAllDatabases` flag plus an explicit `additionalDatabases` list of databases the SQL runner sidebar lists beyond the one in the connection settings. What "database" means follows `getWarehouseLocationLabels`. For Athena it is a Glue database inside the connection's catalog; another catalog is another connection.
- **Listed database.** One database the sidebar can browse for a connection, with the location it occupies in the catalog map (`WarehouseListedDatabase`). The connection's own database is the default listed database.
- **Active connection.** The connection the SQL runner sends typed SQL to. The only picker in the product. Release 2.
- **Superseded row.** A dormant `warehouse_credentials` row kept for history after the project moved to an org connection. Never read, never deleted by a migration.

## Release 1 contract

- `WarehouseConnectionListingFields` carries the two fields on every credential type.
- `WarehouseClient.listDatabases()` returns the listed databases, capped at `WAREHOUSE_LISTED_DATABASES_LIMIT` (100) with a `truncated` marker.
- `WarehouseClient.getTablesForDatabase(listedDatabase)` lists one database's tables. Listing is lazy: databases first, tables on expand.
- Warehouse types outside `WAREHOUSE_TYPES_WITH_DATABASE_LISTING` refuse both calls with `WarehouseDatabaseListingNotSupportedError` ("not supported for this warehouse yet"). Nothing is silently ignored.
