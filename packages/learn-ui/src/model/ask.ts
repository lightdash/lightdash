// Shared by the in-app Learn section and learn.lightdash.com via @lightdash/learn-ui.

import { type LearnCatalogueEntry } from '../types';
import { ROLE_LABEL, SYSTEM_ROLES, type BoardModel } from './model';

/** One lesson match from the ask API. */
export type AskMatch = {
    courseId: string;
    lessonId?: string;
    title: string;
    score: number;
};

/** A curated chip, as published on the catalogue. */
export type AskSuggestion = { query: string; courseId: string };

export type AskHighlights = {
    /** Modules the role holds that the query hit: these glow. */
    matched: Set<string>;
    /** Modules the query hit that the role cannot open: outlined, not hidden. */
    locked: Set<string>;
};

/**
 * Chips are offers, not answers, so an offer the role cannot take is worse than
 * one fewer chip. Authored order is kept: the library curates which reads first.
 */
/** Chips stay on one row: the first few authored suggestions the role can use. */
export const SUGGESTION_LIMIT = 3;

export type AskModel = {
    askHighlights: (
        results: AskMatch[],
        entries: LearnCatalogueEntry[],
        held: Iterable<string>,
    ) => AskHighlights;
    suggestionsFor: (
        suggestions: AskSuggestion[],
        entries: LearnCatalogueEntry[],
        held: Iterable<string>,
    ) => AskSuggestion[];
    lockedLabel: (entry: LearnCatalogueEntry) => string | null;
};

export const createAskModel = (board: BoardModel): AskModel => {
    const { courseFor, heldBy, isUnlocked } = board;

    /**
     * A locked match is shown rather than filtered out: the answer existing is
     * useful even when the learner cannot open it yet, and hiding it would make
     * the board look like the library has no answer at all.
     */
    const askHighlights = (
        results: AskMatch[],
        entries: LearnCatalogueEntry[],
        held: Iterable<string>,
    ): AskHighlights => {
        const heldList = Array.from(held);
        const byId = new Map(entries.map((entry) => [entry.id, entry]));
        const matched = new Set<string>();
        const locked = new Set<string>();
        for (const result of results) {
            const entry = byId.get(result.courseId);
            if (!entry) continue;
            if (isUnlocked(entry, heldList)) matched.add(entry.id);
            else locked.add(entry.id);
        }
        return { matched, locked };
    };

    const suggestionsFor = (
        suggestions: AskSuggestion[],
        entries: LearnCatalogueEntry[],
        held: Iterable<string>,
    ): AskSuggestion[] => {
        const holdable = new Set(
            courseFor(entries, held).map((entry) => entry.id),
        );
        return suggestions
            .filter((s) => holdable.has(s.courseId))
            .slice(0, SUGGESTION_LIMIT);
    };

    /**
     * What to say beside a locked match. Null when every system role holds the
     * module, because then the lock is not about the role and naming one would
     * mislead.
     */
    const lockedLabel = (entry: LearnCatalogueEntry): string | null => {
        const holders = heldBy(entry);
        if (holders.length === 0 || holders.length === SYSTEM_ROLES.length)
            return null;
        return `${ROLE_LABEL[holders[0]]} and above`;
    };

    return { askHighlights, suggestionsFor, lockedLabel };
};
