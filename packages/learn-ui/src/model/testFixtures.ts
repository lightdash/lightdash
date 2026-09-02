import {
    getAllScopeMap,
    getAllScopesForRole,
    type ProjectMemberRole as CommonProjectMemberRole,
} from '@lightdash/common';
import { type Scope, type ScopeSource } from '../scope/types';
import { type LearnCatalogueEntry } from '../types';

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

/** Test-only: the real registry, so the model tests keep their meaning. */
export const commonScopeSource: ScopeSource = {
    getAllScopeMap: (opts) =>
        getAllScopeMap(opts) as unknown as Record<string, Scope>,
    getAllScopesForRole: (role) =>
        getAllScopesForRole(role as CommonProjectMemberRole),
};
