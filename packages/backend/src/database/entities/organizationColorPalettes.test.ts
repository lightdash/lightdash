import knex from 'knex';
import { getTracker, MockClient, Tracker } from 'knex-mock-client';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { resolveColorPalette } from './organizationColorPalettes';

describe('resolveColorPalette', () => {
    const database = knex({ client: MockClient, dialect: 'pg' });
    let tracker: Tracker;
    beforeAll(() => {
        tracker = getTracker();
    });
    afterEach(() => {
        tracker.reset();
    });

    // Default fixture: every layer has a palette set. Each test nulls out
    // the layer(s) it wants to "delete" to exercise the fallthrough.
    const cascadeRow = (overrides: Record<string, unknown>) => ({
        project_uuid: 'project-uuid',
        project_name: 'project',
        organization_uuid: 'org-uuid',
        organization_name: 'org',
        chart_uuid: 'chart-uuid',
        chart_name: 'chart',
        chart_palette_uuid: 'chart-palette-uuid',
        chart_palette_name: 'chart palette',
        chart_palette_colors: ['#c0c0c0'],
        chart_palette_dark_colors: null,
        space_uuid: 'space-uuid',
        space_name: 'space',
        space_palette_uuid: 'space-palette-uuid',
        space_palette_name: 'space palette',
        space_palette_colors: ['#5e5e5e'],
        space_palette_dark_colors: null,
        dashboard_uuid: 'dashboard-uuid',
        dashboard_name: 'dashboard',
        dashboard_palette_uuid: 'dashboard-palette-uuid',
        dashboard_palette_name: 'dashboard palette',
        dashboard_palette_colors: ['#d4d4d4'],
        dashboard_palette_dark_colors: null,
        project_palette_uuid: 'project-palette-uuid',
        project_palette_name: 'project palette',
        project_palette_colors: ['#111111', '#222222'],
        project_palette_dark_colors: null,
        org_palette_uuid: 'org-palette-uuid',
        org_palette_name: 'org palette',
        org_palette_colors: ['#abcdef'],
        org_palette_dark_colors: null,
        ...overrides,
    });

    // Regression: when ON DELETE SET NULL fires on a deleted palette, the
    // resolver SQL returns NULL palette columns for that layer; the cascade
    // must fall through cleanly without throwing.
    test('falls through to project layer when chart, dashboard, and space palettes have been deleted', async () => {
        tracker.on
            .any(() => true)
            .responseOnce({
                rows: [
                    cascadeRow({
                        chart_palette_uuid: null, // FK was set to null by ON DELETE SET NULL
                        chart_palette_name: null,
                        chart_palette_colors: null,
                        chart_palette_dark_colors: null,
                        dashboard_palette_uuid: null,
                        dashboard_palette_name: null,
                        dashboard_palette_colors: null,
                        dashboard_palette_dark_colors: null,
                        space_palette_uuid: null,
                        space_palette_name: null,
                        space_palette_colors: null,
                        space_palette_dark_colors: null,
                    }),
                ],
            });

        const result = await resolveColorPalette({
            database,
            lightdashConfig: lightdashConfigMock,
            projectUuid: 'project-uuid',
            chartUuid: 'chart-uuid',
        });

        expect(result.source).toEqual({
            type: 'project',
            uuid: 'project-uuid',
            name: 'project',
        });
        expect(result.colors).toEqual(['#111111', '#222222']);
        expect(result.paletteUuid).toBe('project-palette-uuid');
    });

    test('falls through to organization layer when dashboard, space, and project palettes have been deleted', async () => {
        tracker.on
            .any(() => true)
            .responseOnce({
                rows: [
                    cascadeRow({
                        chart_uuid: null,
                        chart_name: null,
                        chart_palette_uuid: null,
                        chart_palette_name: null,
                        chart_palette_colors: null,
                        chart_palette_dark_colors: null,
                        dashboard_palette_uuid: null,
                        dashboard_palette_name: null,
                        dashboard_palette_colors: null,
                        dashboard_palette_dark_colors: null,
                        space_palette_uuid: null,
                        space_palette_name: null,
                        space_palette_colors: null,
                        space_palette_dark_colors: null,
                        project_palette_uuid: null,
                        project_palette_name: null,
                        project_palette_colors: null,
                        project_palette_dark_colors: null,
                    }),
                ],
            });

        const result = await resolveColorPalette({
            database,
            lightdashConfig: lightdashConfigMock,
            projectUuid: 'project-uuid',
            dashboardUuid: 'dashboard-uuid',
        });

        expect(result.source).toEqual({
            type: 'organization',
            uuid: 'org-uuid',
            name: 'org',
        });
        expect(result.colors).toEqual(['#abcdef']);
    });

    test('returns default palette when every layer is null', async () => {
        tracker.on
            .any(() => true)
            .responseOnce({
                rows: [
                    cascadeRow({
                        chart_uuid: null,
                        chart_name: null,
                        chart_palette_uuid: null,
                        chart_palette_name: null,
                        chart_palette_colors: null,
                        chart_palette_dark_colors: null,
                        space_uuid: null,
                        space_name: null,
                        space_palette_uuid: null,
                        space_palette_name: null,
                        space_palette_colors: null,
                        space_palette_dark_colors: null,
                        dashboard_uuid: null,
                        dashboard_name: null,
                        dashboard_palette_uuid: null,
                        dashboard_palette_name: null,
                        dashboard_palette_colors: null,
                        dashboard_palette_dark_colors: null,
                        project_palette_uuid: null,
                        project_palette_name: null,
                        project_palette_colors: null,
                        project_palette_dark_colors: null,
                        org_palette_uuid: null,
                        org_palette_name: null,
                        org_palette_colors: null,
                        org_palette_dark_colors: null,
                    }),
                ],
            });

        const result = await resolveColorPalette({
            database,
            lightdashConfig: lightdashConfigMock,
            projectUuid: 'project-uuid',
        });

        expect(result.source).toEqual({ type: 'default' });
        expect(result.paletteUuid).toBeNull();
    });

    // SQL charts call the resolver without `chartUuid` (no per-chart override).
    // With no space-level palette, the cascade must fall through to the project
    // layer rather than misattributing to the chart branch.
    test('returns project palette for SQL-chart call shape (no chartUuid, no space override)', async () => {
        tracker.on
            .any(() => true)
            .responseOnce({
                rows: [
                    cascadeRow({
                        chart_uuid: null,
                        chart_name: null,
                        chart_palette_uuid: null,
                        chart_palette_name: null,
                        chart_palette_colors: null,
                        chart_palette_dark_colors: null,
                        space_palette_uuid: null,
                        space_palette_name: null,
                        space_palette_colors: null,
                        space_palette_dark_colors: null,
                        dashboard_uuid: null,
                        dashboard_name: null,
                        dashboard_palette_uuid: null,
                        dashboard_palette_name: null,
                        dashboard_palette_colors: null,
                        dashboard_palette_dark_colors: null,
                    }),
                ],
            });

        const result = await resolveColorPalette({
            database,
            lightdashConfig: lightdashConfigMock,
            projectUuid: 'project-uuid',
            spaceUuid: 'space-uuid',
        });

        expect(result.source).toEqual({
            type: 'project',
            uuid: 'project-uuid',
            name: 'project',
        });
        expect(result.colors).toEqual(['#111111', '#222222']);
        expect(result.paletteUuid).toBe('project-palette-uuid');
    });
});
