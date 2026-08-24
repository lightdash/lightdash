import { z } from 'zod';

export type LearnFeatureRequirement = {
    id: string;
    label: string;
    plan: string;
};

export type LearnCatalogueEntry = {
    id: string;
    title: string;
    description: string;
    version: number;
    contentHash: string;
    path: string;
    lessonCount: number;
    durationMinutes: number | null;
    tags: string[];
    track: string | null;
    /**
     * Scope tag this module teaches: `action:Subject` or
     * `action:Subject@global`; null = untagged. For a CS-169 scope-group
     * module this is the ENTRY scope — the member whose minimum holding role
     * is lowest — so pre-CS-169 consumers keep working unchanged.
     */
    scope: string | null;
    /**
     * CS-169 scope groups: the sorted unique set of the module's lesson
     * scopes (singleton for a single-scope module, empty for an untagged
     * one). Optional in the type — not just schema-defaulted like `scope` —
     * so the board test fixtures shared byte-identically with the academy
     * twin need not carry it; the schema default fills it on parse.
     */
    scopes?: string[];
    /**
     * One scope tag per lesson, in lesson order (null = untagged lesson).
     * Empty for a pre-CS-169 catalogue. Optional for the same twin-fixture
     * reason as `scopes`.
     */
    lessonScopes?: (string | null)[];
    requires: LearnFeatureRequirement[];
    publishedAt: string;
};

/** A curated Ask chip: the question, and the module that answers it. */
export type LearnAskSuggestion = {
    query: string;
    courseId: string;
};

export type LearnCatalogue = {
    generatedAt: string;
    courses: LearnCatalogueEntry[];
    suggestions: LearnAskSuggestion[];
};

const LearnFeatureRequirementSchema = z.object({
    id: z.string().min(1),
    label: z.string(),
    plan: z.string(),
});

export const LearnCatalogueEntrySchema: z.ZodType<LearnCatalogueEntry> = z
    .object({
        id: z.string().min(1),
        title: z.string().min(1),
        description: z.string(),
        version: z.number().int(),
        contentHash: z.string().min(1),
        path: z.string().min(1),
        lessonCount: z.number().int(),
        durationMinutes: z.number().nullable(),
        tags: z.array(z.string()),
        track: z.string().nullable(),
        scope: z.string().nullable().default(null),
        scopes: z.array(z.string()).default([]),
        lessonScopes: z.array(z.string().nullable()).default([]),
        requires: z.array(LearnFeatureRequirementSchema).default([]),
        publishedAt: z.string(),
    })
    .passthrough() as unknown as z.ZodType<LearnCatalogueEntry>;

const LearnAskSuggestionSchema = z.object({
    query: z.string().min(1),
    courseId: z.string().min(1),
});

export const LearnCatalogueSchema: z.ZodType<LearnCatalogue> = z
    .object({
        generatedAt: z.string(),
        courses: z.array(LearnCatalogueEntrySchema),
        suggestions: z.array(LearnAskSuggestionSchema).default([]),
    })
    .passthrough() as unknown as z.ZodType<LearnCatalogue>;

export type LearnQuizQuestion = {
    id: string;
    prompt: string;
    choices: string[];
    answer: number;
};

export type LearnLesson = {
    id: string;
    title: string;
    html: string;
    /**
     * CS-169: the scope this lesson teaches (null = untagged, always
     * visible). Defaulted by the schema so a pre-CS-169 course.json —
     * immutable per contentHash, never rewritten — still parses.
     */
    scope: string | null;
};

/** A clickable region on a demo step, as fractions of the image. */
export type LearnDemoHotspot = {
    x: number;
    y: number;
    width: number;
    height: number;
};

export type LearnDemoStep = {
    image: string;
    caption: string;
    hotspot: LearnDemoHotspot | null;
};

/** An interactive click-through demo a lesson mounts with `data-demo`. */
export type LearnDemo = {
    id: string;
    title: string;
    viewport: { width: number; height: number };
    steps: LearnDemoStep[];
};

export type LearnCourse = {
    id: string;
    title: string;
    passingScore: number;
    logo?: string;
    lessons: LearnLesson[];
    quiz: { questions: LearnQuizQuestion[] };
    demos: Record<string, LearnDemo>;
    version: number;
    contentHash: string;
    publishedAt: string;
    /** Absolute base URL lesson-relative `assets/…` refs resolve against. */
    assetBaseUrl: string;
};

const LearnDemoSchema = z
    .object({
        id: z.string().min(1),
        title: z.string(),
        viewport: z.object({ width: z.number(), height: z.number() }),
        steps: z.array(
            z
                .object({
                    image: z.string().min(1),
                    caption: z.string(),
                    hotspot: z
                        .object({
                            x: z.number(),
                            y: z.number(),
                            width: z.number(),
                            height: z.number(),
                        })
                        .nullish()
                        .transform((value) => value ?? null),
                })
                .passthrough(),
        ),
    })
    .passthrough();

export const LearnCourseSchema = z
    .object({
        id: z.string().min(1),
        title: z.string().min(1),
        passingScore: z.number(),
        logo: z.string().optional(),
        demos: z.record(LearnDemoSchema).default({}),
        lessons: z.array(
            z
                .object({
                    id: z.string().min(1),
                    title: z.string().min(1),
                    html: z.string(),
                    scope: z.string().nullable().default(null),
                })
                .passthrough(),
        ),
        quiz: z
            .object({
                questions: z.array(
                    z
                        .object({
                            id: z.string().min(1),
                            prompt: z.string(),
                            choices: z.array(z.string()),
                            answer: z.number().int(),
                        })
                        .passthrough(),
                ),
            })
            .passthrough(),
        version: z.number().int(),
        contentHash: z.string().min(1),
        publishedAt: z.string(),
    })
    .passthrough();

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

export const LearnProgressResponseSchema = z
    .object({
        email: z.string(),
        courses: z.array(
            z
                .object({
                    courseId: z.string(),
                    startedAt: z.string().nullable(),
                    completedAt: z.string().nullable(),
                    lessonsCompleted: z.array(z.string()),
                    quiz: z
                        .object({
                            bestScore: z.number().nullable(),
                            passed: z.boolean(),
                            passedAt: z.string().nullable(),
                        })
                        .passthrough()
                        .nullable(),
                    lastEventAt: z.string().nullable(),
                })
                .passthrough(),
        ),
    })
    .passthrough();

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

export const LearnEventInputSchema: z.ZodType<LearnEventInput> = z
    .object({
        verb: z.enum([
            'started',
            'progressed',
            'completed',
            'passed',
            'failed',
        ]),
        object: z
            .object({
                type: z.enum(['course', 'lesson', 'quiz']),
                course: z.string().min(1),
                lesson: z.string().optional(),
                contentHash: z.string().optional(),
                version: z.number().int().optional(),
            })
            .strict(),
        result: z
            .object({
                score: z.number().min(0).max(100).optional(),
                passed: z.boolean().optional(),
                completion: z.boolean().optional(),
            })
            .strict()
            .optional(),
        occurredAt: z.string().datetime({ offset: true }),
    })
    .strict() as unknown as z.ZodType<LearnEventInput>;

export type LearnProgressResults = {
    /** Null when the instance has no Learn service token — progress is client-local. */
    courses: LearnCourseProgress[] | null;
    serverSynced: boolean;
};

export type ApiLearnCatalogueResponse = {
    status: 'ok';
    results: LearnCatalogue;
};

export type ApiLearnCourseResponse = {
    status: 'ok';
    results: LearnCourse;
};

export type ApiLearnProgressResponse = {
    status: 'ok';
    results: LearnProgressResults;
};

export type ApiLearnEventsResponse = {
    status: 'ok';
    results: { accepted: number };
};

export type LearnBadgeTier = 'bronze' | 'silver' | 'gold' | 'violet';

export type LearnCourseBadge = {
    courseId: string;
    tier: LearnBadgeTier;
};

export type LearnBadgesResults = {
    /** Null when the instance has no Learn service token: tiers are server-derived only. */
    badges: LearnCourseBadge[] | null;
};

// The envelope passes unknown fields through for forward compatibility; each
// badge is stripped to the contract, so a new upstream field never reaches a browser.
export const LearnBadgesResponseSchema = z
    .object({
        badges: z.array(
            z.object({
                courseId: z.string().min(1),
                tier: z.enum(['bronze', 'silver', 'gold', 'violet']),
            }),
        ),
    })
    .passthrough();

export type LearnAskRequest = {
    query: string;
};

/** The longest question the search accepts: shared by the schema and the input. */
export const LEARN_ASK_QUERY_MAX_LENGTH = 500;

export const LearnAskRequestSchema: z.ZodType<LearnAskRequest> = z
    .object({
        query: z.string().min(1).max(LEARN_ASK_QUERY_MAX_LENGTH),
    })
    .strict() as unknown as z.ZodType<LearnAskRequest>;

export type LearnAskMatch = {
    courseId: string;
    lessonId: string | null;
    title: string;
    score: number;
};

export type LearnAskResults = {
    matches: LearnAskMatch[];
};

export const LearnAskResponseSchema = z
    .object({
        results: z.array(
            z.object({
                courseId: z.string().min(1),
                lessonId: z
                    .string()
                    .nullish()
                    .transform((value) => value ?? null),
                title: z.string(),
                score: z.number(),
            }),
        ),
    })
    .passthrough();

export type ApiLearnBadgesResponse = {
    status: 'ok';
    results: LearnBadgesResults;
};

export type ApiLearnAskResponse = {
    status: 'ok';
    results: LearnAskResults;
};
