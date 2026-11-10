import {
    ChartKind,
    DefaultSupportedDbtVersion,
    ProjectType,
    type DocumentContent,
} from '@lightdash/common';
import { type Knex } from 'knex';
import { randomUUID } from 'node:crypto';
import { DocumentModel } from '../../../models/DocumentModel';
import {
    createMigratedDatabase,
    type MigratedDatabase,
} from '../../../testing/migratedDatabase';

type Fixture = {
    projectUuid: string;
    spaceUuid: string;
    userUuid: string;
    chartUuid: string;
    sqlChartUuid: string;
};

const createFixture = async (database: Knex): Promise<Fixture> => {
    const [{ organization_id: organizationId }] = await database(
        'organizations',
    )
        .insert({ organization_name: `document links ${randomUUID()}` })
        .returning('organization_id');
    const [{ user_uuid: userUuid }] = await database('users')
        .insert({
            first_name: 'Document',
            last_name: 'Links',
            is_active: true,
            is_marketing_opted_in: false,
            is_setup_complete: true,
            is_tracking_anonymized: false,
        })
        .returning('user_uuid');
    const [{ project_id: projectId, project_uuid: projectUuid }] =
        await database('projects')
            .insert({
                name: 'links',
                organization_id: organizationId,
                project_type: ProjectType.DEFAULT,
                dbt_connection: null,
                dbt_connection_type: null,
                copied_from_project_uuid: null,
                dbt_version: DefaultSupportedDbtVersion,
                created_by_user_uuid: userUuid,
                organization_warehouse_credentials_uuid: null,
            })
            .returning(['project_id', 'project_uuid']);
    const [{ space_id: spaceId, space_uuid: spaceUuid }] = await database(
        'spaces',
    )
        .insert({
            name: 'Reports',
            slug: 'reports',
            path: 'reports',
            project_id: projectId,
            parent_space_uuid: null,
            inherit_parent_permissions: true,
            is_default_user_space: false,
        })
        .returning(['space_id', 'space_uuid']);
    const [{ saved_query_uuid: chartUuid }] = await database('saved_queries')
        .insert({
            name: 'Monthly revenue',
            description: undefined,
            slug: 'monthly-revenue',
            last_version_chart_kind: ChartKind.TABLE,
            last_version_updated_by_user_uuid: userUuid,
            color_palette_uuid: null,
            project_uuid: projectUuid,
            space_id: spaceId,
            dashboard_uuid: null,
        })
        .returning('saved_query_uuid');
    await database('saved_query_slug_mappings').insert({
        project_uuid: projectUuid,
        saved_query_uuid: chartUuid,
        slug: 'old-revenue',
    });
    const [{ saved_sql_uuid: sqlChartUuid }] = await database('saved_sql')
        .insert({
            name: 'Revenue SQL',
            description: null,
            slug: 'revenue-sql',
            project_uuid: projectUuid,
            created_by_user_uuid: userUuid,
            space_uuid: spaceUuid,
            dashboard_uuid: null,
        })
        .returning('saved_sql_uuid');
    return { projectUuid, spaceUuid, userUuid, chartUuid, sqlChartUuid };
};

describe('Document saved chart links on the real schema', () => {
    let migrated: MigratedDatabase;
    let database: Knex;
    let model: DocumentModel;
    let fixture: Fixture;

    const withLinks = (): DocumentContent => ({
        markdown: [
            '# Revenue',
            `<saved-chart uuid="${fixture.chartUuid}" title="Live">`,
            `<saved-sql-chart uuid="${fixture.sqlChartUuid}">`,
        ].join('\n\n'),
        charts: {},
    });
    const linkRows = async (documentVersionUuid: string) =>
        database('document_version_saved_charts')
            .where('document_version_uuid', documentVersionUuid)
            .select('saved_query_uuid', 'saved_sql_uuid')
            .orderBy('saved_query_uuid');
    const createDocument = (content: DocumentContent) =>
        model.create({
            projectUuid: fixture.projectUuid,
            spaceUuid: fixture.spaceUuid,
            name: `Report ${randomUUID()}`,
            description: '',
            content,
            createdByUserUuid: fixture.userUuid,
        });

    beforeAll(async () => {
        migrated = await createMigratedDatabase();
        database = migrated.database;
        model = new DocumentModel({ database });
    });

    afterAll(async () => {
        await migrated?.destroy();
    });

    beforeEach(async () => {
        fixture = await createFixture(database);
    });

    test('each version records the charts it links', async () => {
        const created = await createDocument(withLinks());
        expect(await linkRows(created.version.versionUuid)).toEqual([
            { saved_query_uuid: fixture.chartUuid, saved_sql_uuid: null },
            { saved_query_uuid: null, saved_sql_uuid: fixture.sqlChartUuid },
        ]);

        const updated = await model.updateContent(
            fixture.projectUuid,
            created.documentUuid,
            {
                baseVersionUuid: created.version.versionUuid,
                content: { markdown: '# Revenue', charts: {} },
                expectedSpaceUuid: fixture.spaceUuid,
            },
            fixture.userUuid,
        );
        expect(await linkRows(updated.version.versionUuid)).toEqual([]);
        expect(await linkRows(created.version.versionUuid)).toHaveLength(2);
    });

    test('lists only Documents whose current version links the chart', async () => {
        const linked = await createDocument(withLinks());
        const unlinked = await createDocument(withLinks());
        await model.updateContent(
            fixture.projectUuid,
            unlinked.documentUuid,
            {
                baseVersionUuid: unlinked.version.versionUuid,
                content: { markdown: '# Unlinked', charts: {} },
                expectedSpaceUuid: fixture.spaceUuid,
            },
            fixture.userUuid,
        );
        expect(
            await model.findDocumentsLinkingChart(
                fixture.projectUuid,
                'chart',
                fixture.chartUuid,
            ),
        ).toEqual([
            {
                documentUuid: linked.documentUuid,
                name: linked.name,
                slug: linked.slug,
                spaceUuid: fixture.spaceUuid,
            },
        ]);
        expect(
            await model.findDocumentsLinkingChart(
                fixture.projectUuid,
                'sqlChart',
                fixture.sqlChartUuid,
            ),
        ).toEqual([
            expect.objectContaining({ documentUuid: linked.documentUuid }),
        ]);
    });

    test('finds charts by uuid, current slug and renamed slug, within the project', async () => {
        const found = await model.findSavedChartsForLinks(
            fixture.projectUuid,
            'chart',
            { uuids: [], slugs: ['old-revenue'] },
        );
        expect(found).toEqual([
            {
                kind: 'chart',
                uuid: fixture.chartUuid,
                slugs: ['old-revenue', 'monthly-revenue'],
                spaceUuid: fixture.spaceUuid,
                dashboardUuid: null,
                isDeleted: false,
            },
        ]);
        expect(
            await model.findSavedChartsForLinks(
                fixture.projectUuid,
                'sqlChart',
                {
                    uuids: [fixture.sqlChartUuid],
                    slugs: [],
                },
            ),
        ).toEqual([expect.objectContaining({ uuid: fixture.sqlChartUuid })]);
        const other = await createFixture(database);
        expect(
            await model.findSavedChartsForLinks(other.projectUuid, 'chart', {
                uuids: [fixture.chartUuid],
                slugs: [],
            }),
        ).toEqual([]);
    });

    test('permanently deleting a chart drops its links and keeps the Document', async () => {
        const created = await createDocument(withLinks());
        await database('saved_queries')
            .where('saved_query_uuid', fixture.chartUuid)
            .delete();
        await database('saved_sql')
            .where('saved_sql_uuid', fixture.sqlChartUuid)
            .delete();
        expect(await linkRows(created.version.versionUuid)).toEqual([]);
        const document = await model.get(
            fixture.projectUuid,
            created.documentUuid,
        );
        expect(document.version.content).toEqual(withLinks());
    });

    test('a link to a chart that no longer exists is stored without a row', async () => {
        const content: DocumentContent = {
            markdown: `<saved-chart uuid="${randomUUID()}">`,
            charts: {},
        };
        const created = await createDocument(content);
        expect(await linkRows(created.version.versionUuid)).toEqual([]);
        expect(created.version.content).toEqual(content);
    });

    test('the table rejects a row naming both or neither chart', async () => {
        const created = await createDocument(withLinks());
        await expect(
            database('document_version_saved_charts').insert({
                document_version_uuid: created.version.versionUuid,
                saved_query_uuid: fixture.chartUuid,
                saved_sql_uuid: fixture.sqlChartUuid,
            }),
        ).rejects.toThrow(/document_version_saved_charts_one_chart/);
        await expect(
            database('document_version_saved_charts').insert({
                document_version_uuid: created.version.versionUuid,
            }),
        ).rejects.toThrow(/document_version_saved_charts_one_chart/);
    });
});
