import {
    NotFoundError,
    toolGetKnowledgeDocumentContentOutputSchema,
} from '@lightdash/common';
import { describe, expect, it, vi } from 'vitest';
import { executeGetKnowledgeDocumentContent } from './getKnowledgeDocumentContent';

vi.mock('@sentry/node', () => ({
    captureException: vi.fn(),
    addBreadcrumb: vi.fn(),
    getActiveSpan: vi.fn(),
}));

vi.mock('../../../../logging/logger', () => ({
    __esModule: true,
    default: { error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const documentUuid = '3f1c2a7e-8b4d-4e2f-9a6b-1c2d3e4f5a6b';

const document = {
    uuid: documentUuid,
    name: 'Revenue glossary',
    mimeType: 'text/markdown',
    content: 'Net revenue excludes refunds & chargebacks.',
};

describe('getKnowledgeDocumentContent', () => {
    it('renders the document as text and as structured content from the same data', async () => {
        const output = await executeGetKnowledgeDocumentContent(
            {
                getKnowledgeDocumentContent: vi
                    .fn()
                    .mockResolvedValue(document),
            },
            { documentUuid },
        );

        expect(output.result).toBe(
            `<knowledgedocument uuid="${documentUuid}" mimeType="text/markdown">
  <name>Revenue glossary</name>
  <content>Net revenue excludes refunds & chargebacks.</content>
</knowledgedocument>`,
        );
        expect(output.metadata).toEqual({
            status: 'success',
            name: 'Revenue glossary',
            contentSizeBytes: Buffer.byteLength(document.content, 'utf8'),
        });
        expect(output.structuredContent).toEqual(document);
        expect(
            toolGetKnowledgeDocumentContentOutputSchema.safeParse(output)
                .success,
        ).toBe(true);
    });

    it('mirrors the error text as structured content when the document cannot be read', async () => {
        const output = await executeGetKnowledgeDocumentContent(
            {
                getKnowledgeDocumentContent: vi
                    .fn()
                    .mockRejectedValue(new NotFoundError('Document not found')),
            },
            { documentUuid },
        );

        expect(output.metadata).toEqual({ status: 'error' });
        expect(output.result).toContain('Error reading knowledge document.');
        expect(output.result).toContain('Document not found');
        expect(output.structuredContent).toEqual({ error: output.result });
        expect(
            toolGetKnowledgeDocumentContentOutputSchema.safeParse(output)
                .success,
        ).toBe(true);
    });
});
