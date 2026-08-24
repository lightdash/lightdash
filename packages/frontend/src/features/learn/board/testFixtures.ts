import { type LearnCatalogueEntry } from '@lightdash/common';

export const entry = (
    overrides: Partial<LearnCatalogueEntry> & { id: string },
): LearnCatalogueEntry => ({
    title: overrides.id,
    description: '',
    version: 1,
    contentHash: 'abc123',
    path: `courses/${overrides.id}/abc123/course.json`,
    lessonCount: 3,
    durationMinutes: null,
    tags: [],
    track: null,
    scope: null,
    requires: [],
    publishedAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
});
