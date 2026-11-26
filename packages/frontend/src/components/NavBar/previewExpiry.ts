const MS_PER_DAY = 1000 * 60 * 60 * 24;

/** Whole days until a preview project expires; 0 on its last day. */
export const getExpiresInDays = (expiresAt: Date): number =>
    Math.max(
        0,
        Math.ceil((new Date(expiresAt).getTime() - Date.now()) / MS_PER_DAY),
    );

export const formatExpiresIn = (days: number): string => {
    if (days === 0) return 'Expires today';
    return days === 1 ? 'Expires in 1 day' : `Expires in ${days} days`;
};
