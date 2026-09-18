import {
    NotFoundError,
    toolReadContentOutputSchema,
    toolReadContentStructuredContentSchema,
    type DashboardAsCode,
} from '@lightdash/common';
import type { ToolExecutionOptions } from 'ai';
import type {
    DocumentContentResult,
    ReadContentFn,
} from '../types/aiAgentDependencies';
import { getReadContent } from './readContent';

vi.mock('@sentry/node', () => ({
    captureException: vi.fn(),
    addBreadcrumb: vi.fn(),
    getActiveSpan: vi.fn(() => undefined),
}));

const options: ToolExecutionOptions = { toolCallId: 'call', messages: [] };

const dashboard: DashboardAsCode = {
    name: 'Sales overview',
    slug: 'sales-overview',
    description: 'Revenue by region',
    tiles: [],
    tabs: [],
    spaceSlug: 'marketing',
    version: 1,
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

const executeReadContent = async (
    readContent: ReadContentFn,
    args: Parameters<ReadContentFn>[0],
    documentsEnabled = false,
) => {
    const readContentTool = getReadContent({ readContent, documentsEnabled });
    if (!readContentTool.execute) {
        throw new Error('Missing executor');
    }
    const output = await readContentTool.execute(args, options);
    if (Symbol.asyncIterator in output) {
        throw new Error('Expected a non-streaming tool result');
    }
    return output;
};

// Every fact in the structured content must already be visible in the text.
const expectStructuredContentMatchesText = (output: {
    result: string;
    structuredContent: unknown;
}) => {
    const structured = toolReadContentStructuredContentSchema.parse(
        output.structuredContent,
    );
    expect(
        output.result.startsWith(
            `<${structured.type} href="${structured.href}" />\n---\n`,
        ),
    ).toBe(true);
    expect(output.result).toContain(`"slug": "${structured.slug}"`);
    expect(output.result).toContain(`"name": "${structured.name}"`);
    if (structured.type === 'document') {
        expect(output.result).toContain(`"uuid": "${structured.uuid}"`);
        expect(output.result).toContain(
            `"versionUuid": "${structured.versionUuid}"`,
        );
    }
};

describe('readContent tool', () => {
    it('returns the dashboard as text and as structured content', async () => {
        const href = '/projects/project/dashboards/sales-overview';
        const readContent: ReadContentFn = vi
            .fn()
            .mockResolvedValue({ type: 'dashboard', content: dashboard, href });

        const output = await executeReadContent(readContent, {
            type: 'dashboard',
            slug: 'sales-overview',
        });

        expect(readContent).toHaveBeenCalledWith({
            type: 'dashboard',
            slug: 'sales-overview',
        });
        expect(output.result).toBe(
            `<dashboard href="${href}" />\n---\n${JSON.stringify(
                dashboard,
                null,
                2,
            )}`,
        );
        expect(output.metadata).toEqual({
            status: 'success',
            slug: 'sales-overview',
            name: 'Sales overview',
            href,
        });
        expect(output.structuredContent).toEqual({
            type: 'dashboard',
            slug: 'sales-overview',
            name: 'Sales overview',
            href,
            content: dashboard,
        });
        expectStructuredContentMatchesText(output);
        expect(toolReadContentOutputSchema.safeParse(output).success).toBe(
            true,
        );
    });

    it('includes the Document uuid and version in structured content', async () => {
        const readContent: ReadContentFn = vi.fn().mockResolvedValue(document);

        const output = await executeReadContent(
            readContent,
            { type: 'document', documentUuid },
            true,
        );

        expect(output.result).toBe(
            `<document href="${document.href}" />\n---\n${JSON.stringify(
                document,
                null,
                2,
            )}`,
        );
        expect(output.metadata).toEqual({
            status: 'success',
            slug: 'findings',
            name: 'Findings',
            href: document.href,
            uuid: documentUuid,
            versionUuid,
        });
        expect(output.structuredContent).toEqual({
            type: 'document',
            slug: 'findings',
            name: 'Findings',
            href: document.href,
            uuid: documentUuid,
            versionUuid,
            content: document.content,
        });
        expectStructuredContentMatchesText(output);
        expect(toolReadContentOutputSchema.safeParse(output).success).toBe(
            true,
        );
    });

    it('mirrors a read failure as { error }', async () => {
        const readContent: ReadContentFn = vi
            .fn()
            .mockRejectedValue(new NotFoundError('Chart not found'));

        const output = await executeReadContent(readContent, {
            type: 'chart',
            slug: 'missing',
        });

        expect(output.metadata).toEqual({ status: 'error' });
        expect(output.result).toContain('Error reading chart "missing"');
        expect(output.result).toContain('Chart not found');
        expect(output.structuredContent).toEqual({ error: output.result });
        expect(toolReadContentOutputSchema.safeParse(output).success).toBe(
            true,
        );
    });

    it('mirrors a rejected Document read as { error } without calling the dependency', async () => {
        const readContent: ReadContentFn = vi.fn();

        const output = await executeReadContent(readContent, {
            type: 'document',
            documentUuid,
        });

        expect(readContent).not.toHaveBeenCalled();
        expect(output.metadata).toEqual({ status: 'error' });
        expect(output.structuredContent).toEqual({ error: output.result });
        expect(toolReadContentOutputSchema.safeParse(output).success).toBe(
            true,
        );
    });
});
