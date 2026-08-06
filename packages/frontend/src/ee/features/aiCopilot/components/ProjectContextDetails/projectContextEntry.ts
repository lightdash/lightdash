import type { ApiAiProjectContextEntryResponse } from '@lightdash/common';

export type ProjectContextEntry = ApiAiProjectContextEntryResponse['results'];

/** Entries have no title of their own, so the first term stands in for one. */
export const getProjectContextEntryTitle = (entry: ProjectContextEntry) =>
    entry.terms[0] ?? entry.id;

export const PROJECT_CONTEXT_ENTRY_KIND_LABELS = {
    definition: 'Definition',
    context: 'Context',
} as const;
