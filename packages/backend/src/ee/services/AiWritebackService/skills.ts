import { assertUnreachable, WarehouseTypes } from '@lightdash/common';
import { readFile } from 'fs/promises';
import path from 'path';
import type { WarehouseSkillKey } from './types';

// Directory holding the committed skill markdown. Resolved relative to this
// module so it works in dev (ts-node/tsx → src/) and prod (the backend
// `postbuild` copies `src/**/*.md` into dist/, so the files sit next to the
// compiled JS).
export const SKILLS_SOURCE_DIR = path.join(__dirname, 'skills', 'warehouses');

export const SHARED_SKILL_FILE = '_shared.md';

/**
 * Collapse a `WarehouseTypes` onto the canonical skill key whose file we ship.
 * Several types share one file (`athena` runs Trino/Presto). Warehouses with no
 * dedicated file return `null` and the agent gets `shared.md` only.
 */
export const warehouseTypeToSkillKey = (
    warehouseType: WarehouseTypes | null,
): WarehouseSkillKey | null => {
    if (warehouseType === null) {
        return null;
    }
    switch (warehouseType) {
        case WarehouseTypes.BIGQUERY:
            return 'bigquery';
        case WarehouseTypes.SNOWFLAKE:
            return 'snowflake';
        case WarehouseTypes.POSTGRES:
            return 'postgres';
        case WarehouseTypes.REDSHIFT:
            return 'redshift';
        case WarehouseTypes.DATABRICKS:
            return 'databricks';
        case WarehouseTypes.TRINO:
            return 'trino';
        case WarehouseTypes.ATHENA:
            // Athena is Trino/Presto under the hood — same coercion rules.
            return 'trino';
        case WarehouseTypes.CLICKHOUSE:
        case WarehouseTypes.DUCKDB:
            // No dedicated skill file yet — fall back to shared.md only.
            return null;
        default:
            return assertUnreachable(
                warehouseType,
                `Unhandled warehouse type for skill mapping: ${warehouseType}`,
            );
    }
};

export type LoadedSkills = {
    /** Always present — the dialect-agnostic `_shared.md` body. */
    shared: string;
    /** The dialect-specific body, or `null` for warehouses with no file. */
    warehouse: string | null;
};

/**
 * Read the skill markdown off disk. `shared.md` always; the warehouse file only
 * when `skillKey` resolves to one. Throws if a required file is missing — a
 * shipped skill file going absent is a build/packaging bug, not a runtime
 * condition to swallow.
 */
export const loadWarehouseSkills = async (
    skillKey: WarehouseSkillKey | null,
    readFileFn: (
        filePath: string,
        encoding: BufferEncoding,
    ) => Promise<string> = readFile,
): Promise<LoadedSkills> => {
    const shared = await readFileFn(
        path.join(SKILLS_SOURCE_DIR, SHARED_SKILL_FILE),
        'utf8',
    );
    const warehouse =
        skillKey === null
            ? null
            : await readFileFn(
                  path.join(SKILLS_SOURCE_DIR, `${skillKey}.md`),
                  'utf8',
              );
    return { shared, warehouse };
};
