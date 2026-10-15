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
    /** i18n key in the `scheduler` namespace */
    labelKey: string;
    descriptionKey?: string;
    icon: Icon;
    group: SchedulerNavGroup;
};

export const SCHEDULER_SECTIONS: Record<
    SchedulerSectionId,
    SchedulerSectionMeta
> = {
    alert: {
        id: 'alert',
        labelKey: 'sections.alert.label',
        descriptionKey: 'sections.alert.description',
        icon: IconBell,
        group: 'delivery',
    },
    setup: {
        id: 'setup',
        labelKey: 'sections.setup.label',
        icon: IconCalendarClock,
        group: 'delivery',
    },
    data: {
        id: 'data',
        labelKey: 'sections.data.label',
        icon: IconTable,
        group: 'content',
    },
    message: {
        id: 'message',
        labelKey: 'sections.message.label',
        icon: IconMessage,
        group: 'content',
    },
    ai: {
        id: 'ai',
        labelKey: 'sections.ai.label',
        descriptionKey: 'sections.ai.description',
        icon: IconSparkles,
        group: 'content',
    },
};

export const NAV_GROUP_LABEL_KEYS: Record<SchedulerNavGroup, string> = {
    delivery: 'sections.groups.delivery',
    content: 'sections.groups.content',
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
        return ['setup', 'alert'];
    }
    const sections: SchedulerSectionId[] = ['setup', 'data', 'message'];
    // AI summaries only apply to chart/dashboard deliveries
    if (isAiVisible && !isApp) {
        sections.push('ai');
    }
    return sections;
};
