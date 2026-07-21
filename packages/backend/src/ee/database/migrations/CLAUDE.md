# Writing Migrations

Follow the shared migration-authoring rules in `packages/backend/src/database/migrations/CLAUDE.md` — they apply to EE migrations too (frozen values / no `@lightdash/common` imports, no bind parameters in DDL, primary key requirements, FK indexing, safe migrations on large tables).
