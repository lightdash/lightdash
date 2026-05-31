import { WarehouseTypes } from '@lightdash/common';
import { loadWarehouseSkills, warehouseTypeToSkillKey } from './skills';
import type { WarehouseSkillKey } from './types';

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

describe('loadWarehouseSkills', () => {
    // Inject a fake reader so we test the loading logic — which files it reads
    // and how it handles a null key — without touching the real filesystem.
    const fakeReader = (filePath: string) =>
        Promise.resolve(`body:${filePath}`);

    it('reads shared.md and the dialect file when a skillKey is given', async () => {
        const reads: string[] = [];
        const result = await loadWarehouseSkills('trino', (filePath) => {
            reads.push(filePath);
            return Promise.resolve(`body:${filePath}`);
        });

        expect(reads).toHaveLength(2);
        expect(reads[0]).toMatch(/_shared\.md$/);
        expect(reads[1]).toMatch(/trino\.md$/);
        expect(result.shared).toBe(reads[0] && `body:${reads[0]}`);
        expect(result.warehouse).toBe(reads[1] && `body:${reads[1]}`);
    });

    it('reads only shared.md and returns a null warehouse for a null key', async () => {
        const reads: string[] = [];
        const result = await loadWarehouseSkills(null, (filePath) => {
            reads.push(filePath);
            return Promise.resolve(`body:${filePath}`);
        });

        expect(reads).toHaveLength(1);
        expect(reads[0]).toMatch(/_shared\.md$/);
        expect(result.warehouse).toBeNull();
    });

    it('propagates a read failure rather than swallowing it', async () => {
        await expect(
            loadWarehouseSkills('postgres', () =>
                Promise.reject(new Error('ENOENT')),
            ),
        ).rejects.toThrow('ENOENT');
    });

    it('defaults to the real fs reader when none is injected', async () => {
        // Smoke check that the shipped files are loadable through the default
        // path (no fake reader) — guards the src→dist packaging wiring.
        const { shared, warehouse } = await loadWarehouseSkills('trino');
        expect(shared.length).toBeGreaterThan(0);
        expect(warehouse?.length ?? 0).toBeGreaterThan(0);
    });

    it('keeps the fake reader pure (no real disk access)', async () => {
        const result = await loadWarehouseSkills('bigquery', fakeReader);
        expect(result.shared.startsWith('body:')).toBe(true);
        expect(result.warehouse?.startsWith('body:')).toBe(true);
    });
});
