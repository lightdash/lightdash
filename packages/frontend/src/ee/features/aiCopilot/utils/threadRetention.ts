export const THREAD_RETENTION_PRESETS: { hours: number; label: string }[] = [
    { hours: 1, label: '1 hour' },
    { hours: 24, label: '24 hours' },
    { hours: 168, label: '7 days' },
    { hours: 720, label: '30 days' },
    { hours: 2160, label: '90 days' },
];

export const formatRetentionHours = (hours: number): string => {
    const preset = THREAD_RETENTION_PRESETS.find((p) => p.hours === hours);
    if (preset) return preset.label;
    return hours % 24 === 0 ? `${hours / 24} days` : `${hours} hours`;
};
