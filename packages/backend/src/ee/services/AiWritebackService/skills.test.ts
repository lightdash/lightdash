import { WarehouseTypes } from '@lightdash/common';
import { loadWarehouseSkills, warehouseTypeToSkillKey } from './skills';
import type { WarehouseSkillKey } from './types';

// Every skill file must cover these four categories — they are the failure
// classes behind type-coercion incidents. Headings are asserted verbatim.
const REQUIRED_CATEGORIES = [
    'Boolean ↔ integer',
    'String → number',
    'Date / timestamp',
    'Identifier quoting & case',
];

const ALL_SKILL_KEYS: WarehouseSkillKey[] = [
    'bigquery',
    'snowflake',
    'postgres',
    'redshift',
    'databricks',
    'trino',
];

describe('warehouseTypeToSkillKey', () => {
    it.each<[WarehouseTypes, WarehouseSkillKey | null]>([
        [WarehouseTypes.BIGQUERY, 'bigquery'],
        [WarehouseTypes.SNOWFLAKE, 'snowflake'],
        [WarehouseTypes.POSTGRES, 'postgres'],
        [WarehouseTypes.REDSHIFT, 'redshift'],
        [WarehouseTypes.DATABRICKS, 'databricks'],
        [WarehouseTypes.TRINO, 'trino'],
        // Athena runs Trino/Presto — shares the trino skill.
        [WarehouseTypes.ATHENA, 'trino'],
        // No dedicated file — shared.md only.
        [WarehouseTypes.CLICKHOUSE, null],
        [WarehouseTypes.DUCKDB, null],
    ])('maps %s → %s', (warehouseType, expected) => {
        expect(warehouseTypeToSkillKey(warehouseType)).toBe(expected);
    });

    it('maps null (no warehouse connection) to null', () => {
        expect(warehouseTypeToSkillKey(null)).toBeNull();
    });

    it('handles every WarehouseTypes member without throwing', () => {
        // Guards against a new enum member slipping past the mapper. The mapper
        // uses assertUnreachable, so an unhandled member would throw here.
        for (const warehouseType of Object.values(WarehouseTypes)) {
            expect(() => warehouseTypeToSkillKey(warehouseType)).not.toThrow();
        }
    });
});

describe('warehouse skill files', () => {
    it('always loads shared.md, with frontmatter and a non-empty body', async () => {
        const { shared } = await loadWarehouseSkills(null);
        expect(shared).toMatch(/^---\n[\s\S]*name:\s*warehouse-shared/);
        expect(shared).toContain('description:');
        // Body after the closing frontmatter fence is non-empty.
        const body = shared.split(/^---\s*$/m)[2] ?? '';
        expect(body.trim().length).toBeGreaterThan(0);
    });

    it('returns no warehouse file for an unknown warehouse', async () => {
        const { warehouse } = await loadWarehouseSkills(null);
        expect(warehouse).toBeNull();
    });

    it.each(ALL_SKILL_KEYS)(
        '%s.md has frontmatter, a non-empty body, and the four required categories',
        async (skillKey) => {
            const { warehouse } = await loadWarehouseSkills(skillKey);
            expect(warehouse).not.toBeNull();
            const content = warehouse as string;

            // Frontmatter present with name + description.
            expect(content).toMatch(/^---\n[\s\S]*name:\s*warehouse-/);
            expect(content).toContain('description:');

            // Non-empty body after frontmatter.
            const body = content.split(/^---\s*$/m)[2] ?? '';
            expect(body.trim().length).toBeGreaterThan(0);

            // All four coercion categories are covered.
            for (const category of REQUIRED_CATEGORIES) {
                expect(content).toContain(category);
            }
        },
    );
});
