import i18n from '../../../../i18n/i18n';

export const THREAD_RETENTION_PRESETS: { hours: number }[] = [
    { hours: 1 },
    { hours: 24 },
    { hours: 168 },
    { hours: 720 },
    { hours: 2160 },
];

// 24 is shown as "24 hours" (preset), other multiples of 24 as days
export const formatRetentionHours = (hours: number): string =>
    hours % 24 === 0 && hours !== 24
        ? i18n.t('retention.days', { ns: 'aiAgent', count: hours / 24 })
        : i18n.t('retention.hours', { ns: 'aiAgent', count: hours });
