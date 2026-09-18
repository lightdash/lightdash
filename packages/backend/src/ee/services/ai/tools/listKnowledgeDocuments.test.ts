import {
    toolListKnowledgeDocumentsOutputSchema,
    type AiAgentDocumentSummary,
} from '@lightdash/common';
import { getListKnowledgeDocuments } from './listKnowledgeDocuments';

vi.mock('@sentry/node', () => ({
    captureException: vi.fn(),
    addBreadcrumb: vi.fn(),
    getActiveSpan: vi.fn(),
}));

vi.mock('../../../../logging/logger', () => ({
    __esModule: true,
    default: { error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const makeDocument = (
    overrides: Pick<
        AiAgentDocumentSummary,
        'uuid' | 'name' | 'contentSizeBytes'
    >,
): AiAgentDocumentSummary => ({
    organizationUuid: 'org-uuid',
    projectUuid: null,
    originalFilename: `${overrides.name}.md`,
    mimeType: 'text/markdown',
    alwaysIncludeInContext: false,
    summary: {
        description: `About ${overrides.name}`,
        definedTerms: [],
        relatedExploreNames: [],
        useWhen: 'When asked',
        relevance: 'high',
        warning: null,
    },
    agentAccess: [],
    createdByUserUuid: null,
    updatedByUserUuid: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
});

const execute = async (
    listKnowledgeDocuments: () => Promise<AiAgentDocumentSummary[]>,
) => {
    const tool = getListKnowledgeDocuments({ listKnowledgeDocuments });
    if (!tool.execute) throw new Error('tool has no execute');
    return tool.execute(
        {},
        { messages: [], toolCallId: 'tool-call-1', context: {} },
    );
};

describe('getListKnowledgeDocuments', () => {
    it('lists every document in the text and in structuredContent', async () => {
        const raw = await execute(
            vi.fn().mockResolvedValue([
                makeDocument({
                    uuid: 'doc-1',
                    name: 'Refund policy',
                    contentSizeBytes: 1200,
                }),
                makeDocument({
                    uuid: 'doc-2',
                    name: 'Glossary',
                    contentSizeBytes: 300,
                }),
            ]),
        );

        expect(
            toolListKnowledgeDocumentsOutputSchema.safeParse(raw).success,
        ).toBe(true);
        const output = toolListKnowledgeDocumentsOutputSchema.parse(raw);

        expect(output.metadata).toEqual({ status: 'success' });
        expect(output.structuredContent).toEqual({
            count: 2,
            documents: [
                { uuid: 'doc-1', name: 'Refund policy', sizeBytes: 1200 },
                { uuid: 'doc-2', name: 'Glossary', sizeBytes: 300 },
            ],
        });

        if (!('documents' in output.structuredContent)) {
            throw new Error('expected success structuredContent');
        }
        expect(output.result).toContain(
            `<knowledgedocuments count="${output.structuredContent.count}">`,
        );
        for (const doc of output.structuredContent.documents) {
            expect(output.result).toContain(
                `<document uuid="${doc.uuid}" sizeBytes="${doc.sizeBytes}">`,
            );
            expect(output.result).toContain(`<name>${doc.name}</name>`);
        }
    });

    it('reports an empty list when no documents are curated', async () => {
        const raw = await execute(vi.fn().mockResolvedValue([]));

        expect(
            toolListKnowledgeDocumentsOutputSchema.safeParse(raw).success,
        ).toBe(true);
        const output = toolListKnowledgeDocumentsOutputSchema.parse(raw);

        expect(output.result).toBe('<knowledgedocuments count="0"/>');
        expect(output.metadata).toEqual({ status: 'success' });
        expect(output.structuredContent).toEqual({ count: 0, documents: [] });
    });

    it('mirrors the error text in structuredContent when listing fails', async () => {
        const raw = await execute(
            vi.fn().mockRejectedValue(new Error('storage unavailable')),
        );

        expect(
            toolListKnowledgeDocumentsOutputSchema.safeParse(raw).success,
        ).toBe(true);
        const output = toolListKnowledgeDocumentsOutputSchema.parse(raw);

        expect(output.metadata).toEqual({ status: 'error' });
        expect(output.result).toContain('Error listing knowledge documents.');
        expect(output.result).toContain('storage unavailable');
        expect(output.structuredContent).toEqual({ error: output.result });
    });
});
