import type { AgentSuggestion, AiAgentMessage } from '@lightdash/common';
import {
    canGeneratePostResponseSuggestions,
    DOCUMENT_SUGGESTION_CHIP,
    filterSuggestionsByEnabledTools,
    getEnabledSuggestionTools,
    shouldSuggestDocument,
    withDocumentSuggestion,
    withoutDocumentOffer,
} from './suggestionAccess';

describe('canGeneratePostResponseSuggestions', () => {
    it('allows owned web app threads', () => {
        expect(
            canGeneratePostResponseSuggestions('user-1', {
                createdFrom: 'web_app',
                user: { uuid: 'user-1' },
            }),
        ).toBe(true);
    });

    it('blocks shared threads owned by another user', () => {
        expect(
            canGeneratePostResponseSuggestions('user-1', {
                createdFrom: 'web_app',
                user: { uuid: 'user-2' },
            }),
        ).toBe(false);
    });

    it('blocks Slack threads', () => {
        expect(
            canGeneratePostResponseSuggestions('user-1', {
                createdFrom: 'slack',
                user: { uuid: 'user-1' },
            }),
        ).toBe(false);
    });
});

describe('getEnabledSuggestionTools', () => {
    it('enables every tool when the user can run SQL and write dashboards', () => {
        expect(
            getEnabledSuggestionTools({
                canRunSql: true,
                canCreateDashboards: true,
            }),
        ).toEqual([
            'generateDashboard',
            'generateVisualization',
            'runSql',
            'findContent',
        ]);
    });

    it('drops generateDashboard without dashboard write access', () => {
        expect(
            getEnabledSuggestionTools({
                canRunSql: false,
                canCreateDashboards: false,
            }),
        ).toEqual(['generateVisualization', 'findContent']);
    });

    it('drops runSql without SQL access', () => {
        expect(
            getEnabledSuggestionTools({
                canRunSql: false,
                canCreateDashboards: true,
            }),
        ).toEqual([
            'generateDashboard',
            'generateVisualization',
            'findContent',
        ]);
    });
});

describe('filterSuggestionsByEnabledTools', () => {
    const promptChip = (
        tool: 'generateDashboard' | 'generateVisualization',
    ): AgentSuggestion => ({
        kind: 'prompt',
        label: `chip for ${tool}`,
        tool,
        defaults: {
            explore: null,
            dimensions: [],
            metrics: [],
            timeframe: null,
        },
    });

    const navigateChip: AgentSuggestion = {
        kind: 'navigate',
        label: 'Resume your revenue analysis',
        url: '/projects/p/ai-agents/a/threads/t',
    };

    it('removes prompt chips for disabled tools', () => {
        expect(
            filterSuggestionsByEnabledTools(
                [
                    promptChip('generateDashboard'),
                    promptChip('generateVisualization'),
                ],
                ['generateVisualization'],
            ),
        ).toEqual([promptChip('generateVisualization')]);
    });

    it('keeps navigate chips, which carry no tool', () => {
        expect(
            filterSuggestionsByEnabledTools([navigateChip], ['findContent']),
        ).toEqual([navigateChip]);
    });
});

describe('Document suggestion chip', () => {
    const reply = ({
        artifacts = 0,
        savedDocument = false,
    }: {
        artifacts?: number;
        savedDocument?: boolean;
    }) =>
        ({
            role: 'assistant',
            artifacts: Array.from({ length: artifacts }, (_, index) => ({
                artifactUuid: `artifact-${index}`,
                artifactType: 'chart',
            })),
            toolCalls: savedDocument
                ? [
                      {
                          toolName: 'createContent',
                          toolArgs: { type: 'document' },
                      },
                  ]
                : [],
        }) as unknown as AiAgentMessage;

    it('suggests a Document once the thread has two or more artifacts', () => {
        expect(shouldSuggestDocument([reply({ artifacts: 1 })])).toBe(false);
        expect(
            shouldSuggestDocument([
                reply({ artifacts: 1 }),
                reply({ artifacts: 1 }),
            ]),
        ).toBe(true);
    });

    it('stops suggesting once the thread saved a Document', () => {
        expect(
            shouldSuggestDocument([
                reply({ artifacts: 2 }),
                reply({ savedDocument: true }),
            ]),
        ).toBe(false);
    });

    it('puts the Document chip first and keeps at most five chips', () => {
        const chips = Array.from(
            { length: 5 },
            (_, index): AgentSuggestion => ({
                ...DOCUMENT_SUGGESTION_CHIP,
                label: `Chip ${index}`,
                tool: 'generateVisualization',
            }),
        );

        const withDocument = withDocumentSuggestion(chips);

        expect(withDocument).toHaveLength(5);
        expect(withDocument[0]).toEqual(DOCUMENT_SUGGESTION_CHIP);
        expect(withDocument[0]).toMatchObject({ tool: 'createContent' });
    });

    it('drops generated chips that duplicate the Document offer', () => {
        const duplicate: AgentSuggestion = {
            ...DOCUMENT_SUGGESTION_CHIP,
            label: 'Save this chart as a document',
            tool: 'generateVisualization',
        };
        const followUp: AgentSuggestion = {
            ...DOCUMENT_SUGGESTION_CHIP,
            label: 'Compare 2024 vs 2025 monthly revenue',
            tool: 'generateVisualization',
        };

        expect(withDocumentSuggestion([duplicate, followUp])).toEqual([
            DOCUMENT_SUGGESTION_CHIP,
            followUp,
        ]);
    });
});

describe('withoutDocumentOffer', () => {
    it('drops the Document offer so the reply is not read as a question', () => {
        expect(
            withoutDocumentOffer(
                'Credit card leads.\nWant me to save this as a Document you can share?',
            ),
        ).toBe('Credit card leads.');
        expect(withoutDocumentOffer('Which region do you mean?')).toBe(
            'Which region do you mean?',
        );
    });
});
