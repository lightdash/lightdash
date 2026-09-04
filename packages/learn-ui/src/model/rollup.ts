import type { LearnCourseProgress, LearnEventInput } from '../types';

// Rollup derivations for the Learn section. No DOM access.

export type CardState = 'open' | 'current' | 'done';

export type Rollup = {
    started: boolean;
    lessonsCompleted: Set<string>;
    bestScore: number | null;
    passed: boolean;
    completed: boolean;
};

export function emptyRollup(): Rollup {
    return {
        started: false,
        lessonsCompleted: new Set(),
        bestScore: null,
        passed: false,
        completed: false,
    };
}

export function rollupFromEvents(
    events: LearnEventInput[],
    courseId: string,
): Rollup {
    const rollup = emptyRollup();
    for (const ev of events) {
        if (ev.object.course !== courseId) continue;
        rollup.started = true;
        if (
            ev.verb === 'completed' &&
            ev.object.type === 'lesson' &&
            ev.object.lesson
        ) {
            rollup.lessonsCompleted.add(ev.object.lesson);
        }
        if (
            ev.object.type === 'quiz' &&
            (ev.verb === 'passed' || ev.verb === 'failed')
        ) {
            const score = ev.result?.score;
            if (
                typeof score === 'number' &&
                (rollup.bestScore === null || score > rollup.bestScore)
            ) {
                rollup.bestScore = score;
            }
            if (ev.verb === 'passed') rollup.passed = true;
        }
        if (ev.verb === 'completed' && ev.object.type === 'course') {
            rollup.completed = true;
        }
    }
    if (rollup.passed) rollup.completed = true;
    return rollup;
}

export function rollupFromServer(progress: LearnCourseProgress): Rollup {
    return {
        started: progress.startedAt !== null,
        lessonsCompleted: new Set(progress.lessonsCompleted),
        bestScore: progress.quiz?.bestScore ?? null,
        passed: progress.quiz?.passed ?? false,
        completed:
            progress.completedAt !== null || (progress.quiz?.passed ?? false),
    };
}

export function mergeRollups(a: Rollup, b: Rollup): Rollup {
    const bestScore =
        a.bestScore === null
            ? b.bestScore
            : b.bestScore === null
              ? a.bestScore
              : Math.max(a.bestScore, b.bestScore);
    return {
        started: a.started || b.started,
        lessonsCompleted: new Set([
            ...a.lessonsCompleted,
            ...b.lessonsCompleted,
        ]),
        bestScore,
        passed: a.passed || b.passed,
        completed: a.completed || b.completed,
    };
}

export function cardState(rollup: Rollup | undefined): CardState {
    if (!rollup) return 'open';
    if (rollup.completed || rollup.passed) return 'done';
    if (rollup.started) return 'current';
    return 'open';
}
