import type { AiAgentDocumentSummary } from '@lightdash/common';
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

type Output = { result: string; metadata: { status: string } };

const execute = (tool: ReturnType<typeof getListKnowledgeDocuments>) =>
    tool.execute!(
        {},
        { messages: [], toolCallId: 'tool-call-1', context: {} },
    ) as Promise<Output>;

const baseDocument: AiAgentDocumentSummary = {
    uuid: '11111111-1111-4111-8111-111111111111',
    organizationUuid: '22222222-2222-4222-8222-222222222222',
    projectUuid: '33333333-3333-4333-8333-333333333333',
    name: 'Metric catalog',
    originalFilename: 'metrics.md',
    mimeType: 'text/markdown',
    contentSizeBytes: 42,
    alwaysIncludeInContext: false,
    summary: {
        description: 'Definitions for business metrics & KPIs.',
        definedTerms: ['Net revenue', 'Active user'],
        relatedExploreNames: ['orders', 'users'],
        useWhen: 'Answering revenue questions.',
        relevance: 'high',
        warning: 'Figures exclude <refunds>.',
    },
    agentAccess: [],
    createdByUserUuid: null,
    updatedByUserUuid: null,
    createdAt: new Date('2026-07-10T00:00:00Z'),
    updatedAt: new Date('2026-07-10T00:00:00Z'),
};

describe('getListKnowledgeDocuments', () => {
    it('renders the structured summary as readable XML fields', async () => {
        const output = await execute(
            getListKnowledgeDocuments({
                listKnowledgeDocuments: vi
                    .fn()
                    .mockResolvedValue([baseDocument]),
            }),
        );

        expect(output.metadata).toEqual({ status: 'success' });
        expect(output.result).not.toContain('[object Object]');
        expect(output.result).toContain('<knowledgedocuments count="1">');
        expect(output.result).toContain(
            `<document uuid="${baseDocument.uuid}" sizeBytes="42" relevance="high">`,
        );
        expect(output.result).toContain('<name>Metric catalog</name>');
        expect(output.result).toContain(
            '<description>Definitions for business metrics &amp; KPIs.</description>',
        );
        expect(output.result).toContain(
            '<defines>Net revenue, Active user</defines>',
        );
        expect(output.result).toContain(
            '<applies_to_explores>orders, users</applies_to_explores>',
        );
        expect(output.result).toContain(
            '<use_when>Answering revenue questions.</use_when>',
        );
        expect(output.result).toContain(
            '<warning>Figures exclude &lt;refunds&gt;.</warning>',
        );
    });

    it('omits empty optional summary fields', async () => {
        const output = await execute(
            getListKnowledgeDocuments({
                listKnowledgeDocuments: vi.fn().mockResolvedValue([
                    {
                        ...baseDocument,
                        summary: {
                            description: 'Glossary.',
                            definedTerms: [],
                            relatedExploreNames: [],
                            useWhen: '',
                            relevance: 'low',
                            warning: null,
                        },
                    },
                ]),
            }),
        );

        expect(output.result).toContain('<description>Glossary.</description>');
        expect(output.result).not.toContain('<defines');
        expect(output.result).not.toContain('<applies_to_explores');
        expect(output.result).not.toContain('<use_when');
        expect(output.result).not.toContain('<warning');
    });

    it('renders an empty list without documents', async () => {
        const output = await execute(
            getListKnowledgeDocuments({
                listKnowledgeDocuments: vi.fn().mockResolvedValue([]),
            }),
        );

        expect(output.metadata).toEqual({ status: 'success' });
        expect(output.result).toBe('<knowledgedocuments count="0"/>');
    });
});
