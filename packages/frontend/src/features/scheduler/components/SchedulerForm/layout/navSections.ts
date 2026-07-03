import {
    IconBell,
    IconCalendarClock,
    IconMessage,
    IconSparkles,
    IconTable,
    type Icon,
} from '@tabler/icons-react';

export type SchedulerSectionId = 'alert' | 'setup' | 'data' | 'message' | 'ai';

export type SchedulerNavGroup = 'delivery' | 'content';

export type SchedulerSectionMeta = {
    id: SchedulerSectionId;
    label: string;
    description?: string;
    icon: Icon;
    group: SchedulerNavGroup;
};

export const SCHEDULER_SECTIONS: Record<
    SchedulerSectionId,
    SchedulerSectionMeta
> = {
    alert: {
        id: 'alert',
        label: 'Alert conditions',
        description: 'Fire only when your data crosses a threshold.',
        icon: IconBell,
        group: 'delivery',
    },
    setup: {
        id: 'setup',
        label: 'Setup',
        icon: IconCalendarClock,
        group: 'delivery',
    },
    data: {
        id: 'data',
        label: 'Data & format',
        icon: IconTable,
        group: 'content',
    },
    message: {
        id: 'message',
        label: 'Message',
        icon: IconMessage,
        group: 'content',
    },
    ai: {
        id: 'ai',
        label: 'AI agent',
        description:
            'An agent reads this and writes a short summary, delivered at the top of every email and Slack message.',
        icon: IconSparkles,
        group: 'content',
    },
};

export const NAV_GROUP_LABELS: Record<SchedulerNavGroup, string> = {
    delivery: 'Delivery',
    content: 'Content',
};

/**
 * The nav adapts to the resource being scheduled and to alert mode. Alerts
 * swap the threshold section in for the content sections; apps and charts drop
 * sections that don't apply to them.
 */
export const getVisibleSections = ({
    isThresholdAlert,
    isAiVisible,
    isApp,
}: {
    isThresholdAlert: boolean;
    isAiVisible: boolean;
    isApp: boolean;
}): SchedulerSectionId[] => {
    if (isThresholdAlert) {
        return ['alert', 'setup'];
    }
    const sections: SchedulerSectionId[] = ['setup', 'data', 'message'];
    // AI summaries only apply to chart/dashboard deliveries
    if (isAiVisible && !isApp) {
        sections.push('ai');
    }
    return sections;
};
