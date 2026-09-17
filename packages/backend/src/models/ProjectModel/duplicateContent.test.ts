import { ExploreType } from '@lightdash/common';
import knex, { type Knex } from 'knex';
import { getTracker, MockClient } from 'knex-mock-client';
import { createHash } from 'node:crypto';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { ProjectModel } from './ProjectModel';
import { encryptionUtilMock } from './ProjectModel.mock';

type Row = Record<string, unknown>;

// Only the database boundary is mocked: run the real copy and Knex SQL generation.
const setupCopy = (source: Record<string, Row[]>) => {
    const database = knex({ client: MockClient, dialect: 'pg' });
    // knex-mock-client cannot nest batchInsert savepoints; transactions are not
    // part of this CPU/row-mapping test, so run their callbacks on the mock DB.
    vi.spyOn(database, 'transaction').mockImplementation(async (callback) => {
        if (typeof callback !== 'function')
            throw new Error('Expected transaction callback');
        return callback(database as Knex.Transaction);
    });
    const tracker = getTracker();
    const inserted: Record<string, Row[]> = {};
    const batchSizes: Record<string, number[]> = {};
    const generatedColumns: Record<string, string[]> = {
        spaces: ['space_id', 'space_uuid'],
        dashboards: ['dashboard_id', 'dashboard_uuid'],
        saved_queries: ['saved_query_id', 'saved_query_uuid'],
        saved_sql: ['saved_sql_uuid'],
        saved_sql_versions: ['saved_sql_version_uuid'],
        saved_queries_versions: ['saved_queries_version_id'],
        dashboard_versions: ['dashboard_version_id'],
        ai_agent: ['ai_agent_uuid'],
        pinned_list: ['pinned_list_uuid'],
    };
    tracker.on
        .select(() => true)
        .response(({ sql, bindings }) => {
            if (sql.includes('information_schema')) return [{ exists: true }];
            const table = sql.match(/from "([^"]+)"/)?.[1];
            if (!table) throw new Error(`Unrecognized select: ${sql}`);
            if (table === 'projects') {
                return [{ project_id: bindings[0] === 'preview' ? 2 : 1 }];
            }
            if (table === 'cached_explore') {
                return (
                    source[
                        bindings.includes(ExploreType.VIRTUAL)
                            ? 'virtualViews'
                            : 'externalSourceExplores'
                    ] ?? []
                );
            }
            let rows = source[table] ?? [];
            if (table === 'pinned_list' && bindings[0] === 'preview') return [];
            if (table === 'saved_queries' || table === 'saved_sql') {
                rows = rows.filter((row) =>
                    sql.includes('join "dashboards"')
                        ? row.dashboard_uuid !== null
                        : row.dashboard_uuid === null,
                );
            }
            if (sql.includes('max(')) {
                const column = sql.match(/max\("([^"]+)"\)/)?.[1];
                if (!column) throw new Error(`Unrecognized aggregate: ${sql}`);
                return rows.map((row) => ({ ...row, max: row[column] }));
            }
            return rows;
        });
    tracker.on
        .any(({ sql }) => sql.includes('information_schema'))
        .response([{ exists: true }]);
    tracker.on.update(() => true).response([]);
    tracker.on
        .insert(() => true)
        .response(({ sql, bindings }) => {
            const match = sql.match(
                /insert into "([^"]+)" \((.*?)\) values (.*?) returning|insert into "([^"]+)" \((.*?)\) values (.*)/,
            );
            if (!match) throw new Error(`Unrecognized insert: ${sql}`);
            const table = match[1] ?? match[4];
            const columns = (match[2] ?? match[5])
                .split(', ')
                .map((s) => s.replaceAll('"', ''));
            const values = match[3] ?? match[6];
            let bindingIndex = 0;
            const rows = [...values.matchAll(/\(([^()]*)\)/g)].map(
                (value, index) => {
                    const row: Row = {};
                    value[1].split(', ').forEach((token, columnIndex) => {
                        if (/^\$\d+$/.test(token)) {
                            row[columns[columnIndex]] = bindings[bindingIndex];
                            bindingIndex += 1;
                        }
                    });
                    for (const column of generatedColumns[table] ?? []) {
                        const id =
                            100_000 + (inserted[table]?.length ?? 0) + index;
                        row[column] ??= column.endsWith('_id')
                            ? id
                            : `preview-${table}-${id}`;
                    }
                    return row;
                },
            );
            (inserted[table] ??= []).push(...rows);
            (batchSizes[table] ??= []).push(rows.length);
            return rows;
        });
    const model = new ProjectModel({
        database,
        lightdashConfig: lightdashConfigMock,
        encryptionUtil: encryptionUtilMock,
    });
    return { model, inserted, batchSizes };
};

const makeFixture = ({
    spaces = 2,
    dashboards = 2,
    spaceCharts = 2,
    dashboardCharts = 2,
    sqlCharts = 2,
    tiles = 8,
} = {}): Record<string, Row[]> => {
    const rows = (count: number, make: (i: number) => Row) =>
        Array.from({ length: count }, (_, i) => make(i));
    const chart = (i: number, inDashboard: boolean): Row => ({
        saved_query_id: i + 1,
        saved_query_uuid: `chart-${i}`,
        space_id: inDashboard ? null : (i % spaces) + 1,
        dashboard_uuid: inDashboard ? `dashboard-${i % dashboards}` : null,
    });
    const fixture: Record<string, Row[]> = {
        spaces: rows(spaces, (i) => ({
            space_id: i + 1,
            space_uuid: `space-${i}`,
            path: `space_${i}`,
        })),
        dashboards: rows(dashboards, (i) => ({
            dashboard_id: i + 1,
            dashboard_uuid: `dashboard-${i}`,
            space_id: (i % spaces) + 1,
        })),
        dashboard_versions: rows(dashboards, (i) => ({
            dashboard_version_id: i + 1,
            dashboard_id: i + 1,
        })),
        // Tab UUIDs can be shared by different dashboard versions.
        dashboard_tabs: rows(dashboards, (i) => ({
            uuid: 'shared-tab',
            dashboard_version_id: i + 1,
            dashboard_id: i + 1,
        })),
        dashboard_views: rows(dashboards, (i) => ({
            dashboard_version_id: i + 1,
        })),
        saved_queries: [
            ...rows(spaceCharts, (i) => chart(i, false)),
            ...rows(dashboardCharts, (i) => chart(i + spaceCharts, true)),
        ],
        saved_queries_versions: rows(spaceCharts + dashboardCharts, (i) => ({
            saved_query_id: i + 1,
            saved_queries_version_id: i + 1,
        })),
        saved_sql: rows(sqlCharts, (i) => ({
            saved_sql_uuid: `sql-${i}`,
            space_uuid: i % 2 ? null : `space-${i % spaces}`,
            dashboard_uuid: i % 2 ? `dashboard-${i % dashboards}` : null,
        })),
        saved_sql_versions: rows(sqlCharts, (i) => ({
            saved_sql_uuid: `sql-${i}`,
            saved_sql_version_uuid: `sql-version-${i}`,
            created_at: new Date(0),
        })),
        dashboard_tiles: rows(tiles, (i) => ({
            dashboard_tile_uuid: `tile-${i}`,
            dashboard_version_id: (i % dashboards) + 1,
            tab_uuid: i === tiles - 1 ? null : 'shared-tab',
        })),
        ai_agent: [{ ai_agent_uuid: 'agent' }],
        ai_agent_instruction_versions: [
            { ai_agent_uuid: 'agent', instruction: 'Instructions' },
        ],
        ai_agent_group_access: [
            { ai_agent_uuid: 'agent', group_uuid: 'group' },
        ],
        ai_agent_user_access: [{ ai_agent_uuid: 'agent', user_uuid: 'user' }],
        space_user_access: rows(spaces, (i) => ({
            space_uuid: `space-${i}`,
            user_uuid: 'user',
        })),
        space_group_access: rows(spaces, (i) => ({
            space_uuid: `space-${i}`,
            group_uuid: 'group',
        })),
        pinned_list: [{ pinned_list_uuid: 'pins' }],
        pinned_dashboard: [
            { dashboard_uuid: 'dashboard-1', order: 0 },
            { dashboard_uuid: 'uncopied', order: 1 },
        ],
        pinned_chart: [
            { saved_chart_uuid: 'chart-1', order: 0 },
            { saved_chart_uuid: 'uncopied', order: 1 },
        ],
        pinned_space: [
            { space_uuid: 'space-1', order: 0 },
            { space_uuid: 'uncopied', order: 1 },
        ],
    };
    for (const table of [
        'saved_queries_version_table_calculations',
        'saved_queries_version_custom_dimensions',
        'saved_queries_version_custom_sql_dimensions',
        'saved_queries_version_sorts',
        'saved_queries_version_fields',
        'saved_queries_version_additional_metrics',
    ]) {
        fixture[table] = rows(spaceCharts + dashboardCharts, (i) => ({
            saved_queries_version_id: i + 1,
        }));
    }
    const tileTables = [
        'dashboard_tile_charts',
        'dashboard_tile_sql_charts',
        'dashboard_tile_markdowns',
        'dashboard_tile_looms',
        'dashboard_tile_headings',
        'dashboard_tile_data_apps',
    ];
    tileTables.forEach((table, typeIndex) => {
        fixture[table] = fixture.dashboard_tiles
            .filter((_, i) => i % tileTables.length === typeIndex)
            .map((tile, i) => ({
                dashboard_tile_uuid: tile.dashboard_tile_uuid,
                dashboard_version_id: tile.dashboard_version_id,
                ...(typeIndex === 0
                    ? {
                          saved_chart_id:
                              (i % (spaceCharts + dashboardCharts)) + 1,
                      }
                    : {}),
                ...(typeIndex === 1
                    ? { saved_sql_uuid: `sql-${i % sqlCharts}` }
                    : {}),
            }));
    });
    return fixture;
};

describe('duplicateContent', () => {
    afterEach(() => {
        getTracker().reset();
        vi.restoreAllMocks();
    });

    it('copies large collections in bounded inserts without losing rows', async () => {
        const tags = Array.from({ length: 1001 }, (_, i) => ({
            tag_uuid: `tag-${i}`,
            name: `Tag ${i}`,
            project_uuid: 'source',
        }));
        const fixture = makeFixture({ spaces: 1001 });
        fixture.tags = tags;
        fixture.virtualViews = tags.map((_, i) => ({
            name: `virtual-${i}`,
            explore: { type: ExploreType.VIRTUAL },
        }));
        fixture.externalSourceExplores = tags.map((_, i) => ({
            name: `external-${i}`,
            explore: {
                type: ExploreType.EXTERNAL_SOURCE,
                externalSource: {
                    sourceUuid: `source-${i}`,
                    tableUuid: `table-${i}`,
                },
            },
        }));
        fixture.external_sources = tags.map((_, i) => ({
            external_source_uuid: `source-${i}`,
        }));
        fixture.external_source_tables = tags.map((_, i) => ({
            external_source_uuid: `source-${i}`,
            external_source_table_uuid: `table-${i}`,
        }));
        fixture.ai_agent = tags.map((_, i) => ({
            ai_agent_uuid: `agent-${i}`,
        }));
        for (const table of [
            'ai_agent_instruction_versions',
            'ai_agent_group_access',
            'ai_agent_user_access',
        ]) {
            fixture[table] = tags.map((_, i) => ({
                ai_agent_uuid: `agent-${i}`,
            }));
        }
        for (const table of [
            'pinned_chart',
            'pinned_dashboard',
            'pinned_space',
        ]) {
            fixture[table] = tags.map((_, i) => ({
                ...fixture[table][0],
                order: i,
            }));
        }
        const { model, inserted, batchSizes } = setupCopy(fixture);
        await model.duplicateContent(
            'source',
            'preview',
            fixture.spaces.map((row) => ({ uuid: String(row.space_uuid) })),
        );
        for (const table of [
            'tags',
            'spaces',
            'space_user_access',
            'space_group_access',
            'external_sources',
            'external_source_tables',
            'ai_agent',
            'ai_agent_instruction_versions',
            'ai_agent_group_access',
            'ai_agent_user_access',
            'pinned_chart',
            'pinned_dashboard',
            'pinned_space',
        ]) {
            expect(batchSizes[table]).toEqual([1000, 1]);
            expect(inserted[table]).toHaveLength(1001);
        }
        expect(batchSizes.cached_explore).toEqual([1000, 1, 1000, 1]);
        expect(inserted.tags).toEqual(
            tags.map(({ name }) => ({ name, project_uuid: 'preview' })),
        );
    });
    it('preserves relationships, version-scoped tabs and mappings while skipping uncopied pins', async () => {
        const fixture = makeFixture();
        const { model, inserted } = setupCopy(fixture);
        const result = await model.duplicateContent('source', 'preview', [
            { uuid: 'space-0' },
            { uuid: 'space-1' },
        ]);
        expect(result.spaceMapping).toEqual([
            {
                sourceSpaceUuid: 'space-0',
                previewSpaceUuid: 'preview-spaces-100000',
            },
            {
                sourceSpaceUuid: 'space-1',
                previewSpaceUuid: 'preview-spaces-100001',
            },
        ]);
        expect(
            inserted.saved_queries.map((row) => [
                row.space_id,
                row.dashboard_uuid,
            ]),
        ).toEqual([
            [100000, null],
            [100001, null],
            [null, 'preview-dashboards-100000'],
            [null, 'preview-dashboards-100001'],
        ]);
        expect(
            inserted.saved_queries_versions.map((row) => row.saved_query_id),
        ).toEqual([100000, 100001, 100002, 100003]);
        expect(
            inserted.saved_queries_version_fields.map(
                (row) => row.saved_queries_version_id,
            ),
        ).toEqual([100000, 100001, 100002, 100003]);
        expect(
            inserted.saved_sql_versions.map((row) => row.saved_sql_uuid),
        ).toEqual(['preview-saved_sql-100000', 'preview-saved_sql-100001']);
        expect(
            inserted.dashboard_versions.map((row) => row.dashboard_id),
        ).toEqual([100000, 100001]);
        expect(inserted.dashboard_tiles[0].tab_uuid).toBe(
            inserted.dashboard_tabs[0].uuid,
        );
        expect(inserted.dashboard_tiles[1].tab_uuid).toBe(
            inserted.dashboard_tabs[1].uuid,
        );
        expect(inserted.dashboard_tiles[0].tab_uuid).not.toBe(
            inserted.dashboard_tiles[1].tab_uuid,
        );
        expect(inserted.dashboard_tiles[7].tab_uuid).toBeUndefined();
        expect(inserted.dashboard_tile_charts).toEqual([
            {
                dashboard_tile_uuid: 'tile-0',
                dashboard_version_id: 100000,
                saved_chart_id: 100000,
            },
            {
                dashboard_tile_uuid: 'tile-6',
                dashboard_version_id: 100000,
                saved_chart_id: 100001,
            },
        ]);
        expect(inserted.dashboard_tile_sql_charts[1]).toEqual({
            dashboard_tile_uuid: 'tile-7',
            dashboard_version_id: 100001,
            saved_sql_uuid: 'preview-saved_sql-100001',
        });
        for (const table of [
            'ai_agent_instruction_versions',
            'ai_agent_group_access',
            'ai_agent_user_access',
        ]) {
            expect(inserted[table][0].ai_agent_uuid).toBe(
                'preview-ai_agent-100000',
            );
        }
        expect(inserted.space_user_access[1].space_uuid).toBe(
            'preview-spaces-100001',
        );
        expect(inserted.space_group_access[1].space_uuid).toBe(
            'preview-spaces-100001',
        );
        expect(inserted.pinned_dashboard).toEqual([
            {
                pinned_list_uuid: 'preview-pinned_list-100000',
                dashboard_uuid: 'preview-dashboards-100001',
                order: 0,
            },
        ]);
        expect(inserted.pinned_chart).toEqual([
            {
                pinned_list_uuid: 'preview-pinned_list-100000',
                saved_chart_uuid: 'preview-saved_queries-100001',
                order: 0,
            },
        ]);
        expect(inserted.pinned_space).toEqual([
            {
                pinned_list_uuid: 'preview-pinned_list-100000',
                space_uuid: 'preview-spaces-100001',
                order: 0,
            },
        ]);
        let mapping: unknown;
        try {
            mapping = JSON.parse(
                String(inserted.preview_content[0].content_mapping),
            );
        } catch (error) {
            throw new Error('Invalid persisted preview mapping', {
                cause: error,
            });
        }
        expect(mapping).toMatchObject({
            charts: [
                { id: 1, newId: 100000 },
                { id: 2, newId: 100001 },
                { id: 3, newId: 100002 },
                { id: 4, newId: 100003 },
            ],
            savedSqlVersions: [
                {
                    id: 'sql-version-0',
                    newId: 'preview-saved_sql_versions-100000',
                },
                {
                    id: 'sql-version-1',
                    newId: 'preview-saved_sql_versions-100001',
                },
            ],
        });
    });

    it.each([
        [
            'saved_queries_versions',
            { saved_queries_version_id: 999, saved_query_id: 999 },
            'Cannot find new chart id for 999',
        ],
        [
            'saved_sql_versions',
            { saved_sql_version_uuid: 'missing', saved_sql_uuid: 'missing' },
            'Cannot find new saved SQL uuid for missing',
        ],
        [
            'ai_agent_instruction_versions',
            { ai_agent_uuid: 'missing' },
            'Cannot find new AI agent UUID for missing',
        ],
    ] as const)(
        'rejects unmapped content in %s',
        async (table, row, message) => {
            const fixture = makeFixture();
            fixture[table] = [row];
            const { model } = setupCopy(fixture);
            await expect(
                model.duplicateContent('source', 'preview', [
                    { uuid: 'space-0' },
                    { uuid: 'space-1' },
                ]),
            ).rejects.toThrow(message);
        },
    );

    it.skipIf(!process.env.BENCHMARK_PREVIEW_COPY)(
        'benchmarks the large preview copy workload',
        async () => {
            const fixture = makeFixture({
                spaces: 48,
                dashboards: 2510,
                spaceCharts: 1440,
                dashboardCharts: 30002,
                sqlCharts: 2800,
                tiles: 40395,
            });
            const { model, inserted } = setupCopy(fixture);
            const start = performance.now();
            const cpuStart = process.cpuUsage();
            await model.duplicateContent(
                'source',
                'preview',
                fixture.spaces.map((row) => ({ uuid: String(row.space_uuid) })),
            );
            const cpu = process.cpuUsage(cpuStart);
            const wallMs = performance.now() - start;
            const tabIndexByUuid = new Map(
                inserted.dashboard_tabs.map((tab, index) => [tab.uuid, index]),
            );
            const normalized = Object.entries(inserted)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([table, rows]) => [
                    table,
                    rows.map((row) => ({
                        ...row,
                        ...(table === 'dashboard_tabs'
                            ? { uuid: tabIndexByUuid.get(row.uuid) }
                            : {}),
                        ...(table === 'dashboard_tiles' && row.tab_uuid
                            ? { tab_uuid: tabIndexByUuid.get(row.tab_uuid) }
                            : {}),
                    })),
                ]);
            const contentHash = createHash('sha256')
                .update(JSON.stringify(normalized))
                .digest('hex');
            console.info(
                JSON.stringify({
                    wallMs,
                    cpuMs: (cpu.user + cpu.system) / 1000,
                    contentHash,
                }),
            );
            expect(inserted.saved_queries).toHaveLength(31442);
            expect(inserted.dashboard_tiles).toHaveLength(40395);
            expect(inserted.saved_queries_version_fields).toHaveLength(31442);
        },
        120_000,
    );
});
