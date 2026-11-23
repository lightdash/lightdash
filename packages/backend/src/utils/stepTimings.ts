/** Times consecutive steps: each `mark` adds the ms since the previous mark to that step. */
export const startStepTimings = () => {
    const startedAt = performance.now();
    let last = startedAt;
    const steps: Record<string, number> = {};
    return {
        mark: (step: string) => {
            const now = performance.now();
            steps[`${step}Ms`] = (steps[`${step}Ms`] ?? 0) + now - last;
            last = now;
        },
        summary: (): Record<string, number> => ({
            ...Object.fromEntries(
                Object.entries(steps).map(([key, ms]) => [key, Math.round(ms)]),
            ),
            totalMs: Math.round(performance.now() - startedAt),
        }),
    };
};
