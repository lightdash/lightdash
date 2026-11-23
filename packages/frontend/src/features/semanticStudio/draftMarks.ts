import { createContext } from 'react';
import { type ChangeKind, type FieldChange } from './modelCode';

export type DraftMarks = {
    /** Each drafted model's name as the draft leaves it. */
    labels: Map<string, string>;
    /** What this person's draft does to each model it touches. */
    kinds: Map<string, ChangeKind>;
    /** Who else has unpublished changes to each model. */
    others: Map<string, string[]>;
    /** This person's changes to each model that wait in an open pull request. */
    inReview: Map<string, { pullRequestUrl: string; fields: FieldChange[] }>;
    /** What this person published to each model on this visit to Studio. */
    published: Map<string, PublishedModel>;
};

/** What one publish did to a model: created or changed it, and its fields. */
export type PublishedModel = { kind: ChangeKind; fields: FieldChange[] };

// Read once for the page: every row asking the draft itself costs a subscription per row.
export const DraftMarksContext = createContext<DraftMarks>({
    labels: new Map(),
    kinds: new Map(),
    others: new Map(),
    inReview: new Map(),
    published: new Map(),
});

/** Records what was just published to each model, for the marks above. */
export const MarkPublishedContext = createContext<
    (published: Map<string, PublishedModel>) => void
>(() => {});
