import type { AiAgentMemoryStatus } from '@lightdash/common';

export const MEMORY_STATUS_LABELS: Record<AiAgentMemoryStatus, string> = {
    active: 'Active',
    superseded: 'Superseded',
    retired: 'Retired',
};

export const MEMORY_STATUS_COLORS: Record<AiAgentMemoryStatus, string> = {
    active: 'green',
    superseded: 'yellow',
    retired: 'gray',
};
