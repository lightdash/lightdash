export function markTimeline(
    timings: Record<string, number>,
    name: string,
    edge: 'start' | 'end',
    at = Date.now(),
): void {
    if (process.env.LDENV_TIMELINE === '1')
        timings[`trace:${name}:${edge}`] = at;
}

export async function traced<T>(
    timings: Record<string, number>,
    name: string,
    action: () => Promise<T>,
): Promise<T> {
    markTimeline(timings, name, 'start');
    try {
        return await action();
    } finally {
        markTimeline(timings, name, 'end');
    }
}
