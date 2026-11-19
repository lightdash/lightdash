import { createContext } from 'react';

export type DraftMarks = {
    /** Each drafted model's name as the draft leaves it. */
    labels: Map<string, string>;
    /** Who else has unpublished changes to each model. */
    others: Map<string, string[]>;
};

// Read once for the page: every row asking the draft itself costs a subscription per row.
export const DraftMarksContext = createContext<DraftMarks>({
    labels: new Map(),
    others: new Map(),
});
