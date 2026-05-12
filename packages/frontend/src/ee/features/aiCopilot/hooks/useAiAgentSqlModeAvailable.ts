// True when the per-prompt "SQL mode" toggle should be visible: the
// `ai-agent-run-sql` feature flag is on AND the user holds the same
// `manage:SqlRunner` CASL ability the SQL Runner page requires. Without
// both, the toggle never renders and the agent stays in the semantic
// layer regardless.

import { subject } from '@casl/ability';
import { CommercialFeatureFlags } from '@lightdash/common';
import { useServerFeatureFlag } from '../../../../hooks/useServerOrClientFeatureFlag';
import useApp from '../../../../providers/App/useApp';

export const useAiAgentSqlModeAvailable = (
    projectUuid: string | undefined,
): boolean => {
    const { user } = useApp();
    const flag = useServerFeatureFlag(CommercialFeatureFlags.AiAgentRunSql);

    if (!projectUuid || !user.data) return false;
    if (flag.isLoading || !flag.data?.enabled) return false;

    return (
        user.data.ability.can(
            'manage',
            subject('SqlRunner', {
                organizationUuid: user.data.organizationUuid,
                projectUuid,
            }),
        ) ?? false
    );
};
