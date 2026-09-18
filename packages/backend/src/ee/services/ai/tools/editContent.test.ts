import {
    ChartType,
    ConflictError,
    mcpEditContentArgsSchema,
    toolEditContentOutputSchema,
    type ChartAsCode,
    type DashboardAsCode,
} from '@lightdash/common';
import type { ToolExecutionOptions } from 'ai';
import type { z } from 'zod';
import type {
    DocumentContentResult,
    EditContentFn,
} from '../types/aiAgentDependencies';
import { getEditContent } from './editContent';

const options: ToolExecutionOptions<Record<string, unknown>> = {
    toolCallId: 'call',
    messages: [],
    context: {},
};

const chart: ChartAsCode = {
    name: 'Orders by status',
    slug: 'orders-by-status',
    tableName: 'orders',
    metricQuery: {
        exploreName: 'orders',
        dimensions: ['orders_status', 'orders_region'],
        metrics: ['orders_count'],
        filters: {},
        sorts: [],
        limit: 500,
        tableCalculations: [],
    },
    chartConfig: {
        type: ChartType.CARTESIAN,
        config: {
            layout: { xField: 'orders_status', yField: ['orders_count'] },
            eChartsConfig: { series: [] },
        },
    },
    dashboardSlug: undefined,
    version: 1,
    spaceSlug: 'marketing',
};

const dashboard: DashboardAsCode = {
    name: 'Sales',
    slug: 'sales',
    tiles: [],
    tabs: [],
    version: 1,
    spaceSlug: 'marketing',
};

const versionUuid = '83b3faf3-a320-49ae-8119-0117e813723e';
const documentUuid = 'ccf2dbb5-26f0-4ea3-94e7-758de087326f';
const document: DocumentContentResult = {
    type: 'document',
    uuid: documentUuid,
    href: `/projects/project/documents/${documentUuid}`,
    versionUuid,
    content: {
        schemaVersion: 1,
        name: 'Findings',
        slug: 'findings',
        description: 'Order analysis',
        spaceSlug: 'reports',
        content: {
            cells: [
                {
                    type: 'markdown',
                    content: { markdown: '# Findings' },
                },
            ],
        },
    },
};

const versionUuids = { before: 'version-1', after: 'version-2' };

const executeEditContent = async (
    editContent: EditContentFn,
    args: z.infer<typeof mcpEditContentArgsSchema>,
    documentsEnabled = false,
) => {
    const editContentTool = getEditContent({ editContent, documentsEnabled });
    if (!editContentTool.execute) {
        throw new Error('Missing executor');
    }
    const output = await editContentTool.execute(args, options);
    if (Symbol.asyncIterator in output) {
        throw new Error('Expected a single tool output');
    }
    return output;
};

describe('editContent tool', () => {
    it('returns the edited chart, its link and warnings as text and structured content', async () => {
        const href = '/projects/project/saved/chart-uuid';
        const editContent = vi.fn<EditContentFn>().mockResolvedValue({
            type: 'chart',
            content: chart,
            uuid: 'chart-uuid',
            href,
            versionUuids,
        });

        const output = await executeEditContent(editContent, {
            type: 'chart',
            slug: chart.slug,
            patch: [{ op: 'replace', path: '/name', value: chart.name }],
        });

        expect(toolEditContentOutputSchema.safeParse(output).success).toBe(
            true,
        );
        expect(output.metadata).toEqual({
            status: 'success',
            slug: chart.slug,
            name: chart.name,
            uuid: 'chart-uuid',
            href,
            versionUuids,
            warnings: [expect.stringContaining('orders_region')],
        });
        expect(output.structuredContent).toEqual({
            type: 'chart',
            href,
            content: chart,
            warnings: [expect.stringContaining('orders_region')],
        });
        if (!('warnings' in output.structuredContent)) {
            throw new Error('Expected success structured content');
        }
        expect(output.result).toBe(
            `<chart href="${href}" />\n---\n${JSON.stringify(
                output.structuredContent.content,
                null,
                2,
            )}\n---\n${output.structuredContent.warnings.join('\n')}`,
        );
    });

    it('returns the edited dashboard without warnings', async () => {
        const href = '/projects/project/dashboards/dashboard-uuid';
        const editContent = vi.fn<EditContentFn>().mockResolvedValue({
            type: 'dashboard',
            content: dashboard,
            uuid: 'dashboard-uuid',
            href,
            versionUuids,
        });

        const output = await executeEditContent(editContent, {
            type: 'dashboard',
            slug: dashboard.slug,
            patch: [],
        });

        expect(toolEditContentOutputSchema.safeParse(output).success).toBe(
            true,
        );
        expect(output.metadata).toMatchObject({
            status: 'success',
            href,
            warnings: [],
        });
        expect(output.structuredContent).toEqual({
            type: 'dashboard',
            href,
            content: dashboard,
            warnings: [],
        });
        expect(output.result).toBe(
            `<dashboard href="${href}" />\n---\n${JSON.stringify(
                dashboard,
                null,
                2,
            )}`,
        );
    });

    it('returns the edited Document with its version', async () => {
        const editContent = vi.fn<EditContentFn>().mockResolvedValue(document);

        const output = await executeEditContent(
            editContent,
            {
                type: 'document',
                slug: 'findings',
                documentEdit: {
                    type: 'content',
                    baseVersionUuid: 'e1c7b0a4-2d61-4f0e-9d8f-3a3c6e6a4a10',
                    content: document.content.content,
                },
            },
            true,
        );

        expect(toolEditContentOutputSchema.safeParse(output).success).toBe(
            true,
        );
        expect(output.metadata).toMatchObject({
            status: 'success',
            href: document.href,
            versionUuids: {
                before: 'e1c7b0a4-2d61-4f0e-9d8f-3a3c6e6a4a10',
                after: versionUuid,
            },
        });
        expect(output.structuredContent).toEqual({
            type: 'document',
            href: document.href,
            uuid: documentUuid,
            versionUuid,
            content: document.content,
            warnings: [],
        });
        expect(output.result).toBe(
            `<document href="${document.href}" />\n---\n${JSON.stringify(
                document,
                null,
                2,
            )}`,
        );
    });

    it('mirrors edit failures as structured errors', async () => {
        const editContent = vi
            .fn<EditContentFn>()
            .mockRejectedValue(new ConflictError('Dashboard has changed'));

        const output = await executeEditContent(editContent, {
            type: 'dashboard',
            slug: 'sales',
            patch: [],
        });

        expect(toolEditContentOutputSchema.safeParse(output).success).toBe(
            true,
        );
        expect(output.metadata).toEqual({ status: 'error' });
        expect(output.result).toContain(
            'Error editing dashboard "sales". Changes were not applied.',
        );
        expect(output.result).toContain('Dashboard has changed');
        expect(output.structuredContent).toEqual({ error: output.result });
    });

    it('mirrors argument validation failures as structured errors', async () => {
        const editContent = vi.fn<EditContentFn>();

        const output = await executeEditContent(
            editContent,
            { type: 'document', slug: 'findings', patch: [] },
            true,
        );

        expect(editContent).not.toHaveBeenCalled();
        expect(toolEditContentOutputSchema.safeParse(output).success).toBe(
            true,
        );
        expect(output.metadata).toEqual({ status: 'error' });
        expect(output.result).toContain(
            'Documents require documentEdit instead of patch.',
        );
        expect(output.structuredContent).toEqual({ error: output.result });
    });
});
