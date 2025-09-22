export type ProfilingPhase = 'mount' | 'update' | 'nested-update';

export interface ProfilingEntry {
    id: string;
    phase: ProfilingPhase;
    actualDuration: number;
    baseDuration: number;
    startTime: number;
    commitTime: number;
    ts: number;
}

type WindowBounds = { start?: number; end?: number };

function stats(values: number[]) {
    const a = values.filter(Number.isFinite);
    if (!a.length) return { n: 0, p50: NaN, p95: NaN, max: NaN, sum: 0 };
    a.sort((x, y) => x - y);
    const pick = (p: number) => a[Math.floor(p * (a.length - 1))];
    return {
        n: a.length,
        p50: pick(0.5),
        p95: pick(0.95),
        max: a[a.length - 1],
        sum: a.reduce((s, v) => s + v, 0),
    };
}

function burstStats(entries: ProfilingEntry[], gapMs = 20) {
    if (!entries.length) return { count: 0, p50: NaN, p95: NaN, max: NaN };
    const byTime = entries.slice().sort((a, b) => a.commitTime - b.commitTime);
    const totals: number[] = [];
    let acc = 0;
    for (let i = 0; i < byTime.length; i += 1) {
        const e = byTime[i];
        const prev = byTime[i - 1];
        if (i === 0 || e.commitTime - prev.commitTime > gapMs) {
            if (i > 0) totals.push(acc);
            acc = 0;
        }
        acc += e.actualDuration;
    }
    totals.push(acc);
    return { count: totals.length, ...stats(totals) };
}

export function summarizeProfiling(
    entries: ProfilingEntry[],
    opts?: {
        id?: string;
        window?: WindowBounds;
        excludeNestedFromStats?: boolean;
        excludeZero?: boolean;
        longCommitThresholdsMs?: number[];
    },
) {
    const {
        id,
        window,
        excludeNestedFromStats = true,
        excludeZero = true,
        longCommitThresholdsMs = [16, 32, 50, 100],
    } = opts || {};

    const inWindow = entries.filter(
        (e) =>
            (!id || e.id === id) &&
            (!window?.start || e.commitTime >= window.start) &&
            (!window?.end || e.commitTime <= window.end),
    );

    const zeroCount = inWindow.filter((e) => e.actualDuration === 0).length;
    const mounts = inWindow.filter((e) => e.phase === 'mount');
    const updates = inWindow.filter((e) => e.phase === 'update');
    const nested = inWindow.filter((e) => e.phase === 'nested-update');

    const forStats = inWindow.filter((e) => {
        if (excludeZero && e.actualDuration === 0) return false;
        if (excludeNestedFromStats && e.phase === 'nested-update') return false;
        return true;
    });

    const s = stats(forStats.map((e) => e.actualDuration));
    const base = stats(inWindow.map((e) => e.baseDuration));

    const long: Record<string, number> = {};
    longCommitThresholdsMs.forEach((t) => {
        long[`>${t}ms`] = forStats.filter((e) => e.actualDuration > t).length;
    });

    const bursts = burstStats(inWindow.filter((e) => e.phase !== 'mount'));

    const spanMs = inWindow.length
        ? Math.max(...inWindow.map((e) => e.commitTime)) -
          Math.min(...inWindow.map((e) => e.startTime))
        : 0;

    const totalSavedMs = inWindow.reduce(
        (acc, e) => acc + Math.max(e.baseDuration - e.actualDuration, 0),
        0,
    );
    const totalOvershootMs = inWindow.reduce(
        (acc, e) => acc + Math.max(e.actualDuration - e.baseDuration, 0),
        0,
    );

    return {
        counts: {
            totalCommits: inWindow.length,
            mounts: mounts.length,
            updates: updates.length,
            nested: nested.length,
            zeroDuration: zeroCount,
        },
        time: {
            totalActualMs: s.sum, // sum of actual render time across commits in window
            p50Ms: s.p50,
            p95Ms: s.p95,
            maxMs: s.max,
            spanMs,
        },
        longCommits: long,
        nested: {
            count: nested.length,
            totalActualMs: nested.reduce((a, e) => a + e.actualDuration, 0),
            bursts: {
                count: bursts.count,
                p50Ms: bursts.p50,
                p95Ms: bursts.p95,
                maxMs: bursts.max,
            },
        },
        baseVsActual: {
            totalSavedMs,
            totalOvershootMs,
            medianBaseMs: base.p50,
        },
    };
}
