import type { AiAgentMemoryScope } from '@lightdash/common';

// Labelled "Personal"/"Project-wide" rather than "User"/"Project" so the badge
// can't be read as the adjacent User and Project columns
export const MEMORY_SCOPE_LABELS: Record<AiAgentMemoryScope, string> = {
    user: 'Personal',
    project: 'Project-wide',
};
