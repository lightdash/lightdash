import {
    ChartKind,
    DefaultSupportedDbtVersion,
    ProjectType,
} from '@lightdash/common';
import { randomUUID } from 'node:crypto';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import {
    createMigratedDatabase,
    type MigratedDatabase,
} from '../../testing/migratedDatabase';
import { resolveColorPalette } from './organizationColorPalettes';

vi.mock('../../config/lightdashConfig', async () => ({
    lightdashConfig: (await import('../../config/lightdashConfig.mock'))
        .lightdashConfigMock,
}));

type Fixture = {
    projectUuid: string;
    spaceUuid: string;
    childSpaceUuid: string;
    dashboardUuid: string;
    chartUuid: string;
};

describe('resolveColorPalette (PostgreSQL)', () => {
    let migrated: MigratedDatabase;
    let home: Fixture;
    let sibling: Fixture;
    let foreign: Fixture;

    const createPalette = async (organizationUuid: string, name: string) => {
        const [palette] = await migrated
            .database('organization_color_palettes')
            .insert({
                organization_uuid: organizationUuid,
                name,
                colors: ['#123456'],
                dark_colors: null,
            })
            .returning('color_palette_uuid');
        return palette.color_palette_uuid as string;
    };

    const createOrganization = async (name: string) => {
        const [organization] = await migrated
            .database('organizations')
            .insert({ organization_name: name })
            .returning(['organization_id', 'organization_uuid']);
        return organization as {
            organization_id: number;
            organization_uuid: string;
        };
    };

    const insertRow = async (
        tableName: string,
        row: Record<string, string | number | boolean | null>,
    ): Promise<Record<string, string>> => {
        const [inserted] = await migrated
            .database<typeof row>(tableName)
            .insert(row)
            .returning('*');
        return inserted as Record<string, string>;
    };

    const createProject = async (
        organization: { organization_id: number; organization_uuid: string },
        name: string,
    ): Promise<Fixture> => {
        const palette = (level: string) =>
            createPalette(
                organization.organization_uuid,
                `${name} ${level} palette`,
            );
        const project = await insertRow('projects', {
            name,
            organization_id: organization.organization_id,
            project_type: ProjectType.DEFAULT,
            dbt_version: DefaultSupportedDbtVersion,
        });
        const space = await insertRow('spaces', {
            name: `${name} space`,
            slug: `parent-${randomUUID()}`,
            path: 'parent',
            project_id: project.project_id,
            parent_space_uuid: null,
            inherit_parent_permissions: true,
            is_default_user_space: false,
            color_palette_uuid: await palette('space'),
        });
        const childSpace = await insertRow('spaces', {
            name: `${name} child space`,
            slug: `child-${randomUUID()}`,
            path: 'parent.child',
            project_id: project.project_id,
            parent_space_uuid: space.space_uuid,
            inherit_parent_permissions: true,
            is_default_user_space: false,
        });
        const dashboard = await insertRow('dashboards', {
            name: `${name} dashboard`,
            slug: `dashboard-${randomUUID()}`,
            space_id: space.space_id,
            project_uuid: project.project_uuid,
            color_palette_uuid: await palette('dashboard'),
        });
        const chart = await insertRow('saved_queries', {
            name: `${name} chart`,
            slug: `chart-${randomUUID()}`,
            space_id: space.space_id,
            project_uuid: project.project_uuid,
            last_version_chart_kind: ChartKind.VERTICAL_BAR,
            color_palette_uuid: await palette('chart'),
        });
        return {
            projectUuid: project.project_uuid,
            spaceUuid: space.space_uuid,
            childSpaceUuid: childSpace.space_uuid,
            dashboardUuid: dashboard.dashboard_uuid,
            chartUuid: chart.saved_query_uuid,
        };
    };

    const resolve = (args: {
        projectUuid: string;
        chartUuid?: string;
        dashboardUuid?: string;
        spaceUuid?: string;
    }) =>
        resolveColorPalette({
            ...args,
            database: migrated.database,
            lightdashConfig: lightdashConfigMock,
        });

    beforeAll(async () => {
        migrated = await createMigratedDatabase(undefined, { min: 0, max: 2 });
        const homeOrganization = await createOrganization('Home org');
        const foreignOrganization = await createOrganization('Foreign org');
        home = await createProject(homeOrganization, 'Home');
        sibling = await createProject(homeOrganization, 'Sibling');
        foreign = await createProject(foreignOrganization, 'Foreign');
    });

    afterAll(async () => {
        await migrated?.destroy();
    });

    it('resolves chart, dashboard and space palettes in the requested project', async () => {
        expect(
            (
                await resolve({
                    projectUuid: home.projectUuid,
                    chartUuid: home.chartUuid,
                })
            ).source,
        ).toEqual({ type: 'chart', uuid: home.chartUuid, name: 'Home chart' });
        expect(
            (
                await resolve({
                    projectUuid: home.projectUuid,
                    dashboardUuid: home.dashboardUuid,
                })
            ).source,
        ).toEqual({
            type: 'dashboard',
            uuid: home.dashboardUuid,
            name: 'Home dashboard',
        });
        expect(
            (
                await resolve({
                    projectUuid: home.projectUuid,
                    spaceUuid: home.childSpaceUuid,
                })
            ).source,
        ).toEqual({
            type: 'space',
            uuid: home.spaceUuid,
            name: 'Home space',
        });
    });

    it.each([
        ['another organization', () => foreign],
        ['another project in the same organization', () => sibling],
    ])('ignores context from %s', async (_label, getOther) => {
        const other = getOther();
        const contexts = [
            { chartUuid: other.chartUuid },
            { dashboardUuid: other.dashboardUuid },
            { spaceUuid: other.spaceUuid },
            { spaceUuid: other.childSpaceUuid },
            {
                chartUuid: other.chartUuid,
                dashboardUuid: other.dashboardUuid,
                spaceUuid: other.childSpaceUuid,
            },
        ];
        for (const context of contexts) {
            // eslint-disable-next-line no-await-in-loop
            const result = await resolve({
                projectUuid: home.projectUuid,
                ...context,
            });
            expect(result.source.type).not.toBe('chart');
            expect(result.source.type).not.toBe('dashboard');
            expect(result.source.type).not.toBe('space');
            expect(JSON.stringify(result)).not.toContain(
                other.projectUuid === foreign.projectUuid
                    ? 'Foreign'
                    : 'Sibling',
            );
        }
    });
});
