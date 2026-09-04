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
    /** `action:Subject` or `action:Subject@global`; null = foundations. */
    scope: string | null;
    /** CS-169 scope-group module: every scope any lesson in it needs. */
    scopes?: string[];
    /** One tag per lesson, in lesson order; absent on pre-CS-169 catalogues. */
    lessonScopes?: (string | null)[];
    requires: LearnFeatureRequirement[];
    publishedAt: string;
};

export type LearnAskSuggestion = {
    query: string;
    courseId: string;
};

export type LearnCatalogue = {
    generatedAt: string;
    courses: LearnCatalogueEntry[];
    suggestions: LearnAskSuggestion[];
};
