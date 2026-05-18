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
        { kind: 'prompt', label: 'Break this down further' },
        { kind: 'prompt', label: 'Compare with a previous period' },
        { kind: 'prompt', label: 'Show only the top results' },
        { kind: 'action', label: 'Save as chart', action: 'saveAsChart' },
    ],
    [
        { kind: 'prompt', label: 'What is driving the change?' },
        { kind: 'prompt', label: 'Roll this up to a higher level' },
        { kind: 'prompt', label: 'Show the methodology' },
        { kind: 'action', label: 'Pin to dashboard', action: 'pinToDashboard' },
    ],
    [
        { kind: 'prompt', label: 'Compare top vs bottom performers' },
        { kind: 'prompt', label: 'Limit to the most recent data' },
        { kind: 'action', label: 'Open in Explore', action: 'openInExplore' },
        { kind: 'action', label: 'Save as chart', action: 'saveAsChart' },
    ],
    [
        { kind: 'prompt', label: 'Schedule this as a recurring report' },
        { kind: 'prompt', label: 'Alert me on significant changes' },
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
