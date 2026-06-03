import { WarehouseTypes } from '@lightdash/common';
import { SHARED_SKILL_PATH, WAREHOUSE_SKILL_PATH } from './constants';
import { warehouseTypeToSkillKey } from './skills';
import { buildSystemPrompt } from './templates';

const DBT_PROJECT_DIR = 'analytics/dbt';
const BASE_CONTEXT = {
    projectName: 'Jaffle shop',
    repository: 'acme/jaffle',
    repoContext: null,
};

const buildFor = (warehouseType: WarehouseTypes | null) =>
    buildSystemPrompt(DBT_PROJECT_DIR, {
        ...BASE_CONTEXT,
        warehouseType,
        hasWarehouseSkill: warehouseTypeToSkillKey(warehouseType) !== null,
    });

describe('buildSystemPrompt — warehouse skill guidance', () => {
    it('names the warehouse and points at both skill files when a file exists', () => {
        const prompt = buildFor(WarehouseTypes.SNOWFLAKE);
        expect(prompt).toContain('warehouse is **snowflake**');
        expect(prompt).toContain(WAREHOUSE_SKILL_PATH);
        expect(prompt).toContain(SHARED_SKILL_PATH);
        expect(prompt).toMatch(/BEFORE editing a `schema.yml` `type:` field/);
    });

    it('maps athena onto the trino skill (still references the warehouse file)', () => {
        const prompt = buildFor(WarehouseTypes.ATHENA);
        expect(prompt).toContain('warehouse is **athena**');
        expect(prompt).toContain(WAREHOUSE_SKILL_PATH);
    });

    it('references only shared.md for a warehouse with no dedicated file', () => {
        const prompt = buildFor(WarehouseTypes.CLICKHOUSE);
        expect(prompt).toContain(SHARED_SKILL_PATH);
        expect(prompt).not.toContain(WAREHOUSE_SKILL_PATH);
        expect(prompt).toMatch(/BEFORE editing a `schema.yml` `type:` field/);
    });

    it('references only shared.md when there is no warehouse connection', () => {
        const prompt = buildFor(null);
        expect(prompt).toContain(SHARED_SKILL_PATH);
        expect(prompt).not.toContain(WAREHOUSE_SKILL_PATH);
    });

    it('matches the snapshot for a representative warehouse (postgres)', () => {
        expect(buildFor(WarehouseTypes.POSTGRES)).toMatchSnapshot();
    });

    it('matches the snapshot for a no-skill warehouse (duckdb)', () => {
        expect(buildFor(WarehouseTypes.DUCKDB)).toMatchSnapshot();
    });
});
