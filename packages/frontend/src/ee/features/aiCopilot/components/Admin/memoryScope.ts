import type { AiAgentMemoryScope } from '@lightdash/common';
import i18n from '../../../../../i18n/i18n';

// Labelled "Personal"/"Project-wide" rather than "User"/"Project" so the badge
// can't be read as the adjacent User and Project columns
export const MEMORY_SCOPE_LABELS: Record<AiAgentMemoryScope, string> = {
    get user() {
        return i18n.t('memories.scope.user', { ns: 'aiCopilotAdmin' });
    },
    get project() {
        return i18n.t('memories.scope.project', { ns: 'aiCopilotAdmin' });
    },
};
