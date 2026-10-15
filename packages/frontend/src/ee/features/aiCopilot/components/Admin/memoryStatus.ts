import type { AiAgentMemoryStatus } from '@lightdash/common';
import i18n from '../../../../../i18n/i18n';

export const MEMORY_STATUS_LABELS: Record<AiAgentMemoryStatus, string> = {
    get active() {
        return i18n.t('memories.status.active', { ns: 'aiCopilotAdmin' });
    },
    get superseded() {
        return i18n.t('memories.status.superseded', { ns: 'aiCopilotAdmin' });
    },
    get retired() {
        return i18n.t('memories.status.retired', { ns: 'aiCopilotAdmin' });
    },
    get promoted() {
        return i18n.t('memories.status.promoted', { ns: 'aiCopilotAdmin' });
    },
};

export const MEMORY_STATUS_COLORS: Record<AiAgentMemoryStatus, string> = {
    active: 'green',
    superseded: 'yellow',
    retired: 'gray',
    promoted: 'violet',
};
