import { toolListContentOutputSchema } from '@lightdash/common';
import type { ListContentFn } from '../types/aiAgentDependencies';
import { getListContent } from './listContent';

vi.mock('@sentry/node', () => ({
    captureException: vi.fn(),
    addBreadcrumb: vi.fn(),
    getActiveSpan: vi.fn(),
}));

vi.mock('../../../../logging/logger', () => ({
    __esModule: true,
    default: { error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

type ListContentTool = ReturnType<typeof getListContent>;
type ListContentResult = Awaited<ReturnType<ListContentFn>>;

const execute = async (
    tool: ListContentTool,
    args: Parameters<NonNullable<ListContentTool['execute']>>[0],
) => {
    if (!tool.execute) throw new Error('listContent tool has no execute');
    const output = await tool.execute(args, {
        messages: [],
        toolCallId: 'tool-call-1',
        context: {},
    });
    const parsed = toolListContentOutputSchema.safeParse(output);
    expect(parsed.success).toBe(true);
    if (!parsed.success) throw parsed.error;
    return parsed.data;
};

const spaceItem: ListContentResult['items'][number] = {
    contentType: 'space',
    name: 'Marketing',
    slug: 'marketing',
    href: '/projects/p1/spaces/space-1',
    chartCount: 3,
    dashboardCount: 1,
    childSpaceCount: 2,
    appCount: 0,
    directAccess: true,
};

const documentItem: ListContentResult['items'][number] = {
    contentType: 'document',
    uuid: 'doc-uuid',
    name: 'Runbook',
    slug: 'runbook',
    href: '/projects/p1/documents/doc-uuid',
};

const chartItem: ListContentResult['items'][number] = {
    contentType: 'chart',
    name: 'Revenue',
    slug: 'revenue',
    href: '/projects/p1/saved/chart-uuid/view#chart-link',
};

describe('getListContent', () => {
    it('renders root spaces and mirrors them as structuredContent', async () => {
        const listContent = vi.fn<ListContentFn>().mockResolvedValue({
            spaceSlug: null,
            items: [spaceItem],
            pagination: {
                page: 1,
                pageSize: 25,
                totalResults: 1,
                totalPageCount: 1,
            },
        });

        const output = await execute(getListContent({ listContent }), {
            spaceSlug: null,
            page: 1,
        });

        expect(listContent).toHaveBeenCalledWith({ spaceSlug: null, page: 1 });
        expect(output.metadata).toEqual({ status: 'success' });
        expect(output.result).toContain(
            '<contentList page="1" pageSize="25" totalResults="1" totalPageCount="1" spaceSlug="">',
        );
        expect(output.result).toContain(
            '<content contentType="space" name="Marketing" slug="marketing" href="/projects/p1/spaces/space-1" chartCount="3" dashboardCount="1" childSpaceCount="2" appCount="0" directAccess="true"/>',
        );
        expect(output.structuredContent).toEqual({
            spaceSlug: null,
            pagination: {
                page: 1,
                pageSize: 25,
                totalResults: 1,
                totalPageCount: 1,
            },
            items: [spaceItem],
        });
    });

    it('renders space children (document and chart) with the same facts in text and structuredContent', async () => {
        const listContent = vi.fn<ListContentFn>().mockResolvedValue({
            spaceSlug: 'marketing',
            items: [documentItem, chartItem],
            pagination: {
                page: 2,
                pageSize: 25,
                totalResults: 27,
                totalPageCount: 2,
            },
        });

        const output = await execute(getListContent({ listContent }), {
            spaceSlug: 'marketing',
            page: 2,
        });

        expect(output.result).toContain(
            '<contentList page="2" pageSize="25" totalResults="27" totalPageCount="2" spaceSlug="marketing">',
        );
        expect(output.result).toContain(
            '<content contentType="document" uuid="doc-uuid" name="Runbook" slug="runbook" href="/projects/p1/documents/doc-uuid"/>',
        );
        expect(output.result).toContain(
            '<content contentType="chart" name="Revenue" slug="revenue" href="/projects/p1/saved/chart-uuid/view#chart-link"/>',
        );
        expect(output.structuredContent).toEqual({
            spaceSlug: 'marketing',
            pagination: {
                page: 2,
                pageSize: 25,
                totalResults: 27,
                totalPageCount: 2,
            },
            items: [documentItem, chartItem],
        });
    });

    it('derives pagination from the items when the dependency returns none', async () => {
        const listContent = vi.fn<ListContentFn>().mockResolvedValue({
            spaceSlug: null,
            items: [],
            pagination: undefined,
        });

        const output = await execute(getListContent({ listContent }), {
            spaceSlug: null,
            page: 1,
        });

        expect(output.metadata).toEqual({ status: 'success' });
        expect(output.result).toBe(
            '<contentList page="1" pageSize="0" totalResults="0" totalPageCount="1" spaceSlug=""/>',
        );
        expect(output.structuredContent).toEqual({
            spaceSlug: null,
            pagination: {
                page: 1,
                pageSize: 0,
                totalResults: 0,
                totalPageCount: 1,
            },
            items: [],
        });
    });

    it('returns the error text mirrored as structuredContent when listing fails', async () => {
        const listContent = vi
            .fn<ListContentFn>()
            .mockRejectedValue(new Error('Space not found'));

        const output = await execute(getListContent({ listContent }), {
            spaceSlug: 'missing',
            page: 1,
        });

        expect(output.metadata).toEqual({ status: 'error' });
        expect(output.result).toContain('Error listing content');
        expect(output.result).toContain('Space not found');
        expect(output.structuredContent).toEqual({ error: output.result });
    });
});
