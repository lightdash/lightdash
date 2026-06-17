import { WarehouseTypes } from '@lightdash/common';
import { SHARED_SKILL_PATH, WAREHOUSE_SKILL_PATH } from './constants';
import { warehouseTypeToSkillKey } from './skills';
import { buildSystemPrompt, type WritebackProjectFormat } from './templates';

const DBT_PROJECT_DIR = 'analytics/dbt';
const BASE_CONTEXT = {
    projectName: 'Jaffle shop',
    repository: 'acme/jaffle',
    repoContext: null,
};

const buildFor = (
    warehouseType: WarehouseTypes | null,
    profilesStaged = false,
    projectFormat: WritebackProjectFormat = 'dbt',
) =>
    buildSystemPrompt(DBT_PROJECT_DIR, {
        ...BASE_CONTEXT,
        warehouseType,
        hasWarehouseSkill: warehouseTypeToSkillKey(warehouseType) !== null,
        profilesStaged,
        projectFormat,
    });

describe('buildSystemPrompt — staged profiles', () => {
    it('omits the discover/copy/strip steps when profiles are pre-staged', () => {
        const staged = buildFor(WarehouseTypes.POSTGRES, true);
        expect(staged).toContain('already been prepared for you');
        expect(staged).not.toContain('Discover the profiles directory');
        expect(staged).not.toContain('Prepare a TEMPORARY profiles directory');
        // still compiles and still emits the PR metadata blocks
        expect(staged).toContain('--skip-warehouse-catalog');
        expect(staged).toMatch(/single-line PR title/);
    });

    it('keeps the full discover/copy/strip steps when not pre-staged', () => {
        const notStaged = buildFor(WarehouseTypes.POSTGRES, false);
        expect(notStaged).toContain('Discover the profiles directory');
        expect(notStaged).toContain('Prepare a TEMPORARY profiles directory');
    });
});

describe('buildSystemPrompt — Lightdash YAML projects', () => {
    const yaml = buildFor(WarehouseTypes.POSTGRES, false, 'lightdash_yaml');

    it('describes a Lightdash YAML project and not a dbt project', () => {
        expect(yaml).toContain('**Lightdash YAML** project (no dbt)');
        expect(yaml).toContain('top-level `metrics:` and `dimensions:`');
        expect(yaml).not.toContain('The dbt project lives at');
    });

    it('skips the profiles.yml dance entirely', () => {
        expect(yaml).not.toContain('Discover the profiles directory');
        expect(yaml).not.toContain('Prepare a TEMPORARY profiles directory');
        expect(yaml).not.toContain('--profiles-dir');
        // still compiles (catalog skipped) and still emits the PR blocks
        expect(yaml).toContain('--skip-warehouse-catalog');
        expect(yaml).toMatch(/single-line PR title/);
    });
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
