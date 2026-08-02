import { WarehouseTypes } from '@lightdash/common';
import {
    EFFECTIVE_DBT_SQL_SKILL,
    SHARED_SKILL_PATH,
    WAREHOUSE_SKILL_PATH,
} from './constants';
import { warehouseTypeToSkillKey } from './skills';
import { buildGeneralSystemPrompt, buildSystemPrompt } from './templates';

const DBT_PROJECT_DIR = 'analytics/dbt';
const BASE_CONTEXT = {
    projectName: 'Jaffle shop',
    repository: 'acme/jaffle',
    repoContext: null,
};

const buildFor = (
    warehouseType: WarehouseTypes | null,
    profilesStaged = false,
) =>
    buildSystemPrompt(DBT_PROJECT_DIR, {
        ...BASE_CONTEXT,
        warehouseType,
        hasWarehouseSkill: warehouseTypeToSkillKey(warehouseType) !== null,
        profilesStaged,
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

describe('buildSystemPrompt — dbt/SQL skill guidance', () => {
    it('names the effective-dbt-sql skill and calls out correlated subqueries', () => {
        const prompt = buildFor(WarehouseTypes.POSTGRES);
        expect(prompt).toContain(EFFECTIVE_DBT_SQL_SKILL);
        expect(prompt).toContain('correlated subquery');
        expect(prompt).toMatch(/reuse an existing dimension or metric/);
    });

    it('injects the nudge regardless of warehouse (warehouse-agnostic)', () => {
        expect(buildFor(null)).toContain(EFFECTIVE_DBT_SQL_SKILL);
        expect(buildFor(WarehouseTypes.CLICKHOUSE)).toContain(
            EFFECTIVE_DBT_SQL_SKILL,
        );
    });

    it('de-conflicts with the warehouse guidance rather than restating it', () => {
        const prompt = buildFor(WarehouseTypes.POSTGRES);
        // The SQL nudge points to the type-coercion guidance as a separate
        // concern instead of adding a second competing "you MUST read" block.
        expect(prompt).toContain('separate from the type-coercion rules');
        expect(prompt).not.toMatch(
            /BEFORE writing.*dbt model SQL.*you MUST read/,
        );
    });

    it('is scoped to the dbt writeback agent — absent from the general prompt', () => {
        const general = buildGeneralSystemPrompt({
            repository: 'acme/jaffle',
            repoContext: null,
        });
        expect(general).not.toContain(EFFECTIVE_DBT_SQL_SKILL);
    });
});
