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

export type ApiLearnCatalogueResponse = {
    status: 'ok';
    results: LearnCatalogue;
};
