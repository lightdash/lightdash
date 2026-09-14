import {
    AGENT_SUGGESTION_TOOLS,
    assertUnreachable,
    type AgentSuggestion,
    type AgentSuggestionTool,
} from '@lightdash/common';

type SuggestionThread = {
    createdFrom: string;
    user: {
        uuid: string;
    };
};

export const canGeneratePostResponseSuggestions = (
    userUuid: string,
    thread: SuggestionThread,
) => thread.createdFrom === 'web_app' && thread.user.uuid === userUuid;

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
