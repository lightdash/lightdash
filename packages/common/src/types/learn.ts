import { z } from 'zod';

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
    publishedAt: string;
};

export type LearnCatalogue = {
    generatedAt: string;
    courses: LearnCatalogueEntry[];
};

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
        publishedAt: z.string(),
    })
    .passthrough() as unknown as z.ZodType<LearnCatalogueEntry>;

export const LearnCatalogueSchema: z.ZodType<LearnCatalogue> = z
    .object({
        generatedAt: z.string(),
        courses: z.array(LearnCatalogueEntrySchema),
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
};

export type LearnCourse = {
    id: string;
    title: string;
    passingScore: number;
    logo?: string;
    lessons: LearnLesson[];
    quiz: { questions: LearnQuizQuestion[] };
    version: number;
    contentHash: string;
    publishedAt: string;
    /** Absolute base URL lesson-relative `assets/…` refs resolve against. */
    assetBaseUrl: string;
};

export const LearnCourseSchema = z
    .object({
        id: z.string().min(1),
        title: z.string().min(1),
        passingScore: z.number(),
        logo: z.string().optional(),
        lessons: z.array(
            z
                .object({
                    id: z.string().min(1),
                    title: z.string().min(1),
                    html: z.string(),
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

export type ApiLearnCatalogueResponse = {
    status: 'ok';
    results: LearnCatalogue;
};

export type ApiLearnCourseResponse = {
    status: 'ok';
    results: LearnCourse;
};
