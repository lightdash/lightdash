import type { AiProjectContextEntry } from '@lightdash/common';

/** Display title for a context entry; the judge-authored title may be absent. */
export const getContextEntryTitle = (entry: AiProjectContextEntry) =>
    entry.title ?? entry.entryId;
