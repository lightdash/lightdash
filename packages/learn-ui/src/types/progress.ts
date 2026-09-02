export type LearnCourseProgress = {
    courseId: string;
    startedAt: string | null;
    completedAt: string | null;
    lessonsCompleted: string[];
    quiz: {
        bestScore: number | null;
        passed: boolean;
        passedAt: string | null;
    } | null;
    lastEventAt: string | null;
};

export type LearnEventVerb =
    | 'started'
    | 'progressed'
    | 'completed'
    | 'passed'
    | 'failed';

/**
 * A learning event as written by the Learn section. `source` is pinned
 * server-side to 'learn' — the client never chooses the surface.
 */
export type LearnEventInput = {
    verb: LearnEventVerb;
    object: {
        type: 'course' | 'lesson' | 'quiz';
        course: string;
        lesson?: string;
        contentHash?: string;
        version?: number;
    };
    result?: {
        score?: number;
        passed?: boolean;
        completion?: boolean;
    };
    occurredAt: string;
};
