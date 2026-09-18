import { toolResolveUrlOutputSchema } from '@lightdash/common';
import { describe, expect, it, vi } from 'vitest';
import { getResolveUrl } from './resolveUrl';

vi.mock('@sentry/node', () => ({
    captureException: vi.fn(),
    addBreadcrumb: vi.fn(),
    getActiveSpan: vi.fn(),
}));

vi.mock('../../../../logging/logger', () => ({
    __esModule: true,
    default: { error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const execute = async (tool: ReturnType<typeof getResolveUrl>, url: string) => {
    if (!tool.execute) throw new Error('tool has no execute');
    const output = await tool.execute(
        { url },
        { messages: [], toolCallId: 'tool-call-1' },
    );
    if (Symbol.asyncIterator in output) {
        throw new Error('Expected a non-streaming tool result');
    }
    return output;
};

describe('getResolveUrl', () => {
    const shareUrl = 'https://app.lightdash.cloud/share/aBcD1234';
    const expandedUrl =
        'https://app.lightdash.cloud/projects/project-uuid/saved/chart-uuid';

    it('expands a share link and mirrors the expanded url in structuredContent', async () => {
        const resolveUrl = vi
            .fn()
            .mockResolvedValue({ isShareLink: true, url: expandedUrl });

        const output = await execute(getResolveUrl({ resolveUrl }), shareUrl);

        expect(resolveUrl).toHaveBeenCalledWith({ url: shareUrl });
        expect(output.metadata).toEqual({ status: 'success' });
        expect(output.result).toBe(
            `The share link expands to: ${expandedUrl}\nRead the identifiers (project uuid, chart or dashboard uuid, explore name) from this URL and use other tools to fetch the content.`,
        );
        expect(output.structuredContent).toEqual({
            url: shareUrl,
            isShareLink: true,
            resolvedUrl: expandedUrl,
        });
        expect(toolResolveUrlOutputSchema.safeParse(output).success).toBe(true);
    });

    it('reports a non-share link without resolving it', async () => {
        const resolveUrl = vi.fn().mockResolvedValue({ isShareLink: false });

        const output = await execute(
            getResolveUrl({ resolveUrl }),
            expandedUrl,
        );

        expect(output.metadata).toEqual({ status: 'success' });
        expect(output.result).toBe(
            `"${expandedUrl}" is not a share link — read its identifiers directly from the URL path; no resolution is needed.`,
        );
        expect(output.structuredContent).toEqual({
            url: expandedUrl,
            isShareLink: false,
        });
        expect(toolResolveUrlOutputSchema.safeParse(output).success).toBe(true);
    });

    it('returns an error envelope whose structuredContent mirrors the text', async () => {
        const resolveUrl = vi
            .fn()
            .mockRejectedValue(new Error('URL belongs to another instance'));

        const output = await execute(getResolveUrl({ resolveUrl }), shareUrl);

        expect(output.metadata).toEqual({ status: 'error' });
        expect(output.result).toContain(`Error resolving URL "${shareUrl}"`);
        expect(output.result).toContain('URL belongs to another instance');
        expect(output.structuredContent).toEqual({ error: output.result });
        expect(toolResolveUrlOutputSchema.safeParse(output).success).toBe(true);
    });
});
