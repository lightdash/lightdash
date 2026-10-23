import type { AiAgent, AiAgentBattleProfile } from '@lightdash/common';

type ComposerQueriesGateInput = {
    composeSqlRunnerEnabled: boolean;
    agent: Pick<AiAgent, 'enableDataAccess' | 'enableComposerQueries'>;
    isDeepResearch: boolean;
    hasStandardToolAllowlist: boolean;
    battleProfile: AiAgentBattleProfile | null;
};

/**
 * The compose-sql-runner flag makes composer available; the agent setting (on by default) can turn it off. Allowlisted threads keep classic tools.
 * Query path battle profiles override the agent setting.
 */
export const isComposerQueriesEnabled = ({
    composeSqlRunnerEnabled,
    agent,
    isDeepResearch,
    hasStandardToolAllowlist,
    battleProfile,
}: ComposerQueriesGateInput): boolean => {
    if (battleProfile === 'classic') return false;
    const composerAllowed =
        battleProfile === 'composer' || agent.enableComposerQueries;
    return (
        composeSqlRunnerEnabled &&
        agent.enableDataAccess &&
        composerAllowed &&
        !isDeepResearch &&
        !hasStandardToolAllowlist
    );
};
