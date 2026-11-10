import {
    ChartType,
    ContentAsCodeType,
    PromotionAction,
    SpaceAsCodeAction,
    type ChartAsCode,
    type DashboardAsCode,
    type SpaceAsCode,
} from '@lightdash/common';
import { describe, expect, it, vi } from 'vitest';
import { type LightdashApi } from '../../api';
import { uploadContentAsCode } from './uploadContent';

const space: SpaceAsCode = {
    contentType: ContentAsCodeType.SPACE,
    slug: 'sales',
    spaceName: 'Sales',
};
const chart: ChartAsCode = {
    contentType: ContentAsCodeType.CHART,
    version: 1,
    name: 'Revenue',
    slug: 'revenue',
    spaceSlug: 'sales',
    dashboardSlug: undefined,
    tableName: 'orders',
    chartConfig: { type: ChartType.TABLE },
    metricQuery: {
        exploreName: 'orders',
        dimensions: [],
        metrics: [],
        filters: {},
        sorts: [],
        limit: 10,
        tableCalculations: [],
    },
};
const dashboard: DashboardAsCode = {
    contentType: ContentAsCodeType.DASHBOARD,
    version: 1,
    name: 'Overview',
    slug: 'overview',
    spaceSlug: 'sales',
    tiles: [],
    tabs: [],
};

describe('uploadContentAsCode', () => {
    it('preserves a space access policy and displays server warnings', async () => {
        const api = vi.fn().mockResolvedValue({
            action: SpaceAsCodeAction.UPDATE,
            warnings: ['Some inherited access was removed.'],
        });
        await expect(
            uploadContentAsCode(api as unknown as LightdashApi, 'project', {
                type: 'space',
                content: space,
            }),
        ).resolves.toEqual({
            message: 'Updated',
            warnings: ['Some inherited access was removed.'],
        });
        expect(api).toHaveBeenCalledWith({
            method: 'POST',
            url: '/projects/project/code/spaces',
            body: JSON.stringify(space),
        });
    });

    it('applies chart edits even when the exported timestamp is unchanged', async () => {
        const content = {
            ...chart,
            updatedAt: new Date('2026-10-01T00:00:00Z'),
        };
        const api = vi.fn().mockResolvedValue({
            charts: [{ action: PromotionAction.UPDATE, data: content }],
            spaces: [],
            dashboards: [],
        });
        await expect(
            uploadContentAsCode(api as unknown as LightdashApi, 'project', {
                type: 'chart',
                content,
            }),
        ).resolves.toEqual({ message: 'Updated', warnings: [] });
        expect(api).toHaveBeenCalledWith({
            method: 'POST',
            url: '/projects/project/code/charts/revenue',
            body: JSON.stringify({ ...content, force: true }),
        });
    });

    it('uploads dashboards and keeps non-fatal backend warnings', async () => {
        const api = vi.fn().mockResolvedValue({
            dashboards: [{ action: PromotionAction.CREATE, data: dashboard }],
            spaces: [],
            charts: [],
            warnings: ['An app referenced by a tile was not found.'],
        });
        await expect(
            uploadContentAsCode(api as unknown as LightdashApi, 'project', {
                type: 'dashboard',
                content: dashboard,
            }),
        ).resolves.toEqual({
            message: 'Created',
            warnings: ['An app referenced by a tile was not found.'],
        });
        expect(api).toHaveBeenCalledWith({
            method: 'POST',
            url: '/projects/project/code/dashboards/overview',
            body: JSON.stringify(dashboard),
        });
    });
});
