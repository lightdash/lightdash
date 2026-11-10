export const usageProcessingStartDate = (now: Date): string =>
    new Date(Date.parse(now.toISOString().slice(0, 10)) - 7 * 86_400_000)
        .toISOString()
        .slice(0, 10);
