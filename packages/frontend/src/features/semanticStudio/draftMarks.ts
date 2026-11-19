import { createContext } from 'react';
import { type ChangeKind } from './modelCode';

export type DraftMarks = {
    /** Each drafted model's name as the draft leaves it. */
    labels: Map<string, string>;
    /** What this person's draft does to each model it touches. */
    kinds: Map<string, ChangeKind>;
    /** Who else has unpublished changes to each model. */
    others: Map<string, string[]>;
    /** The open pull request holding this person's sent changes to each model. */
    inReview: Map<string, string>;
};

// Read once for the page: every row asking the draft itself costs a subscription per row.
export const DraftMarksContext = createContext<DraftMarks>({
    labels: new Map(),
    kinds: new Map(),
    others: new Map(),
    inReview: new Map(),
});
