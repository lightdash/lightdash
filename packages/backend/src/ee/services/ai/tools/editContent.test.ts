import {
    agentEditContentArgsSchema,
    getSqlApprovalSql,
    ParameterError,
    toolCreateContentOutputSchema,
    toolEditContentOutputSchema,
} from '@lightdash/common';
import type { ToolExecutionOptions } from 'ai';
import type {
    CreateContentFn,
    EditContentFn,
    ReadContentFn,
} from '../types/aiAgentDependencies';
import { getCreateContent } from './createContent';
import { executeEditContent, getAgentEditContent } from './editContent';

describe('editContent errors', () => {
    it('returns a rejected control order to the agent with the valid slugs', async () => {
        const message =
            'Unknown filter slug "missing" in controlOrder. Valid slugs are filter: orders-status; parameter: none; dateZoom: none; section: none';
        const output = await executeEditContent(
            {
                editContent: vi.fn(async () => {
                    throw new ParameterError(message);
                }),
                siteUrl: 'https://example.com',
            },
            {
                slug: 'dashboard',
                type: 'dashboard',
                patch: [
                    {
                        op: 'replace',
                        path: '/config/controlOrder/0/slug',
                        value: 'missing',
                    },
                ],
            },
        );
        expect(output.metadata.status).toBe('error');
        expect(output.result).toContain(message);
    });
});

type EditedContent = Awaited<ReturnType<EditContentFn>>;

describe('editContent with the unused input sent as null', () => {
    const patch = [{ op: 'replace', path: '/name', value: 'Orders' }];
    const documentEdit = { type: 'metadata' as const, name: 'Orders' };
    const dashboard: EditedContent = {
        type: 'dashboard',
        uuid: 'uuid',
        href: '/dashboards/uuid',
        versionUuids: { before: null, after: null },
        content: {
            name: 'Orders',
            slug: 'orders',
            spaceSlug: 'reports',
            version: 1,
            tabs: [],
            tiles: [],
        },
    };
    const document: EditedContent = {
        type: 'document',
        uuid: 'uuid',
        href: '/documents/uuid',
        versionUuid: 'version',
        content: {
            schemaVersion: 2,
            name: 'Orders',
            slug: 'orders',
            description: 'Order analysis',
            spaceSlug: 'reports',
            markdown: '# Orders',
            chart: null,
        },
    };

    it.each([
        {
            args: { type: 'dashboard' as const, patch, documentEdit: null },
            applied: { slug: 'orders', type: 'dashboard', patch },
            edited: dashboard,
        },
        {
            args: { type: 'document' as const, patch: null, documentEdit },
            applied: { slug: 'orders', type: 'document', documentEdit },
            edited: document,
        },
    ])('applies the $args.type edit', async ({ args, applied, edited }) => {
        const editContent = vi.fn<EditContentFn>().mockResolvedValue(edited);
        const output = await executeEditContent(
            {
                editContent,
                siteUrl: 'https://example.com',
                documentsEnabled: true,
            },
            { slug: 'orders', ...args },
        );
        expect(toolEditContentOutputSchema.safeParse(output).success).toBe(
            true,
        );
        expect(output.metadata.status).toBe('success');
        expect(editContent).toHaveBeenCalledWith(applied);
    });
});

type WriteOutput = { result: string; metadata: { status: string } };

describe('agent content writes', () => {
    const siteUrl = 'https://example.com';
    const options = {
        toolCallId: 'call',
        messages: [],
        context: {},
    } as unknown as ToolExecutionOptions<never>;
    const content = {
        name: 'Orders',
        slug: 'orders',
        spaceSlug: 'reports',
        version: 1,
        tabs: [],
        tiles: [],
    };
    const dashboard: EditedContent = {
        type: 'dashboard',
        uuid: 'uuid',
        href: '/dashboards/uuid',
        versionUuids: { before: null, after: null },
        content,
    };
    const editTool = (editContent: EditContentFn) =>
        getAgentEditContent({
            editContent,
            readContent: vi.fn<ReadContentFn>().mockResolvedValue({
                type: 'dashboard',
                href: '/dashboards/uuid',
                content,
            } as Awaited<ReturnType<ReadContentFn>>),
            prepareComposerChartEdit: vi.fn(),
            siteUrl,
        });

    it('saves text edits as a patch and acks with the link', async () => {
        const editContent = vi.fn<EditContentFn>().mockResolvedValue(dashboard);
        const output = (await editTool(editContent).execute!(
            {
                slug: 'orders',
                type: 'dashboard',
                edits: [{ old: 'name: Orders', new: 'name: Sales' }],
            },
            options,
        )) as WriteOutput;

        expect(editContent).toHaveBeenCalledWith({
            slug: 'orders',
            type: 'dashboard',
            patch: [
                { op: 'test', path: '/name', value: 'Orders' },
                { op: 'replace', path: '/name', value: 'Sales' },
            ],
        });
        expect(output.result).toBe(
            '<dashboard href="https://example.com/dashboards/uuid" slug="orders" />\nSaved.',
        );
        expect(toolEditContentOutputSchema.safeParse(output).success).toBe(
            true,
        );
    });

    it('saves a SQL chart patch as sent, so approval finds its SQL in the call', async () => {
        const readContent = vi.fn<ReadContentFn>();
        const editContent = vi.fn<EditContentFn>().mockResolvedValue({
            ...dashboard,
            type: 'sql_chart',
            content: { ...content, sql: 'select 2' },
        } as unknown as EditedContent);
        const args = agentEditContentArgsSchema.parse({
            slug: 'orders',
            type: 'sql_chart',
            patch: [{ op: 'replace', path: '/sql', value: 'select 2' }],
        });
        expect(getSqlApprovalSql(args)).toBe('select 2');

        const output = (await getAgentEditContent({
            editContent,
            readContent,
            prepareComposerChartEdit: vi.fn(),
            siteUrl,
            sqlChartSaving: { mode: 'client_approved' },
        }).execute!(args, options)) as WriteOutput;

        expect(output.metadata.status).toBe('success');
        expect(readContent).not.toHaveBeenCalled();
        expect(editContent).toHaveBeenCalledWith(
            expect.objectContaining({ type: 'sql_chart', patch: args.patch }),
        );
    });

    it('saves nothing when an edit does not match', async () => {
        const editContent = vi.fn<EditContentFn>();
        const output = (await editTool(editContent).execute!(
            {
                slug: 'orders',
                type: 'dashboard',
                edits: [{ old: 'name: Missing', new: 'name: Sales' }],
            },
            options,
        )) as WriteOutput;

        expect(editContent).not.toHaveBeenCalled();
        expect(output.metadata.status).toBe('error');
        expect(toolEditContentOutputSchema.safeParse(output).success).toBe(
            true,
        );
    });

    it('acks a create with the link instead of the content', async () => {
        const created = {
            ...dashboard,
            versionUuids: undefined,
        } as unknown as Awaited<ReturnType<CreateContentFn>>;
        const output = (await getCreateContent({
            createContent: vi.fn<CreateContentFn>().mockResolvedValue(created),
            siteUrl,
            resultFormat: 'ack',
        }).execute!(
            {
                type: 'dashboard',
                content: {
                    ...content,
                    description: null,
                    contentType: 'dashboard',
                    verified: false,
                    filters: {
                        dimensions: [],
                        metrics: [],
                        tableCalculations: [],
                    },
                },
            } as never,
            options,
        )) as WriteOutput;

        expect(output.result).toBe(
            '<dashboard href="https://example.com/dashboards/uuid" slug="orders" />\nSaved.',
        );
        expect(toolCreateContentOutputSchema.safeParse(output).success).toBe(
            true,
        );
    });
});
