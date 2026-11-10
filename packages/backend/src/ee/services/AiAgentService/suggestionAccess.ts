import {
    AGENT_SUGGESTION_TOOLS,
    assertUnreachable,
    DOCUMENT_SUGGESTION_TOOL,
    isAiAppThreadCreatedFrom,
    type AgentSuggestion,
    type AgentSuggestionPromptChip,
    type AgentSuggestionTool,
    type AiAgentMessage,
} from '@lightdash/common';
import { DOCUMENT_OFFER_LINE } from '../ai/prompts/systemV2ContentTools';

type SuggestionThread = {
    createdFrom: string;
    user: {
        uuid: string;
    };
};

export const canGeneratePostResponseSuggestions = (
    userUuid: string,
    thread: SuggestionThread,
) =>
    isAiAppThreadCreatedFrom(thread.createdFrom) &&
    thread.user.uuid === userUuid;

type SuggestionAbilities = {
    canRunSql: boolean;
    canCreateDashboards: boolean;
};

/**
 * Chips must only offer actions the current user can actually carry out —
 * suggesting a dashboard to someone without dashboard write access sends them
 * down a dead end.
 */
export const getEnabledSuggestionTools = ({
    canRunSql,
    canCreateDashboards,
}: SuggestionAbilities): AgentSuggestionTool[] =>
    AGENT_SUGGESTION_TOOLS.filter((tool) => {
        switch (tool) {
            case 'runSql':
                return canRunSql;
            case 'generateDashboard':
                return canCreateDashboards;
            // Reading data and locating existing content are already covered by
            // the access checks that let the user open a thread at all.
            case 'generateVisualization':
            case 'findContent':
                return true;
            default:
                return assertUnreachable(
                    tool,
                    `Unknown agent suggestion tool ${tool}`,
                );
        }
    });

export const filterSuggestionsByEnabledTools = (
    chips: AgentSuggestion[],
    enabledTools: AgentSuggestionTool[],
): AgentSuggestion[] =>
    chips.filter(
        (chip) => chip.kind === 'navigate' || enabledTools.includes(chip.tool),
    );

const MAX_SUGGESTION_CHIPS = 5;

export const DOCUMENT_SUGGESTION_CHIP: AgentSuggestionPromptChip = {
    kind: 'prompt',
    label: 'Save this analysis as a Document',
    tool: DOCUMENT_SUGGESTION_TOOL,
    defaults: { explore: null, dimensions: [], metrics: [], timeframe: null },
};

const DOCUMENT_SAVE_TOOLS = new Set(['createContent', 'editContent']);

/** Two or more charts or dashboards in the thread, and no Document saved from it yet. */
export const shouldSuggestDocument = (
    messages: ReadonlyArray<AiAgentMessage>,
): boolean => {
    let artifactCount = 0;
    for (const message of messages) {
        if (message.role === 'assistant') {
            const savedDocument = message.toolCalls.some(
                ({ toolName, toolArgs }) =>
                    DOCUMENT_SAVE_TOOLS.has(toolName) &&
                    'type' in toolArgs &&
                    toolArgs.type === 'document',
            );
            if (savedDocument) return false;
            artifactCount += message.artifacts?.length ?? 0;
        }
    }
    return artifactCount >= 2;
};

// Generated chips that also offer a Document would duplicate the fixed chip.
export const withDocumentSuggestion = (
    chips: AgentSuggestion[],
): AgentSuggestion[] =>
    [
        DOCUMENT_SUGGESTION_CHIP,
        ...chips.filter((chip) => !/\bdocument\b/i.test(chip.label)),
    ].slice(0, MAX_SUGGESTION_CHIPS);

// The agent's Document offer is answered by the Document chip, so it must not read as a clarifying question.
export const withoutDocumentOffer = (text: string): string =>
    text.replace(DOCUMENT_OFFER_LINE, '').trimEnd();
