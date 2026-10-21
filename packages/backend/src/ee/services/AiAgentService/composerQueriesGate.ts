import type { AiAgent } from '@lightdash/common';

type ComposerQueriesGateInput = {
    multiSourceQueryEnabled: boolean;
    composeSqlRunnerEnabled: boolean;
    agent: Pick<AiAgent, 'enableDataAccess' | 'enableComposerQueries'>;
    isDeepResearch: boolean;
    hasStandardToolAllowlist: boolean;
};

/** Flags make composer available; the agent must also opt in. Allowlisted threads keep classic tools. */
export const isComposerQueriesEnabled = ({
    multiSourceQueryEnabled,
    composeSqlRunnerEnabled,
    agent,
    isDeepResearch,
    hasStandardToolAllowlist,
}: ComposerQueriesGateInput): boolean =>
    multiSourceQueryEnabled &&
    composeSqlRunnerEnabled &&
    agent.enableDataAccess &&
    agent.enableComposerQueries &&
    !isDeepResearch &&
    !hasStandardToolAllowlist;
