// True when the per-prompt "SQL mode" toggle should be visible: the user
// holds the same `manage:SqlRunner` CASL ability the SQL Runner page
// requires. Without it the toggle never renders and the agent stays in
// the semantic layer regardless.

import { subject } from '@casl/ability';
import useApp from '../../../../providers/App/useApp';
import { isEmbedAiAgentRoute } from './aiAgentRouting';

export const useAiAgentSqlModeAvailable = (
    projectUuid: string | undefined,
): boolean => {
    const { user } = useApp();

    if (isEmbedAiAgentRoute()) return false;

    if (!projectUuid || !user.data) return false;

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
