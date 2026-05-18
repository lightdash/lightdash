import { useMemo } from 'react';

export type PostResponseActionId =
    | 'saveAsChart'
    | 'pinToDashboard'
    | 'openInExplore'
    | 'scheduleDelivery';

export type PostResponseChip =
    | {
          kind: 'prompt';
          label: string;
      }
    | {
          kind: 'action';
          label: string;
          action: PostResponseActionId;
      };

const ROTATING_SETS: PostResponseChip[][] = [
    [
        { kind: 'prompt', label: 'Break this down by month' },
        { kind: 'prompt', label: 'Compare with the previous quarter' },
        { kind: 'prompt', label: 'Show only the top 10' },
        { kind: 'action', label: 'Save as chart', action: 'saveAsChart' },
    ],
    [
        { kind: 'prompt', label: 'Filter to enterprise customers' },
        { kind: 'prompt', label: 'Roll this up by region' },
        { kind: 'prompt', label: 'Switch to percentages' },
        { kind: 'action', label: 'Pin to dashboard', action: 'pinToDashboard' },
    ],
    [
        { kind: 'prompt', label: 'What is driving the change?' },
        { kind: 'prompt', label: 'Compare top 5 vs bottom 5' },
        { kind: 'action', label: 'Open in Explore', action: 'openInExplore' },
        { kind: 'action', label: 'Save as chart', action: 'saveAsChart' },
    ],
    [
        { kind: 'prompt', label: 'Schedule this as a weekly digest' },
        { kind: 'prompt', label: 'Show me the SQL behind this' },
        { kind: 'prompt', label: 'Alert me if revenue drops below 50k' },
        {
            kind: 'action',
            label: 'Schedule delivery',
            action: 'scheduleDelivery',
        },
    ],
];

type Args = {
    messageCount: number;
    enabled: boolean;
};

export const usePostResponseChips = ({
    messageCount,
    enabled,
}: Args): PostResponseChip[] => {
    return useMemo(() => {
        if (!enabled) return [];
        const turnIndex = Math.max(0, Math.floor(messageCount / 2) - 1);
        return ROTATING_SETS[turnIndex % ROTATING_SETS.length];
    }, [messageCount, enabled]);
};
