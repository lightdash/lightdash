/**
 * `useSharedAiCommentary()` — AI commentary for the current selection that is
 * saved once and shared: the first viewer generates it, later viewers of the
 * same selection read it, and anyone may edit it. Storage is shared app state
 * (versioned, with history); generation is `useAiPrompt`. The saved text is
 * viewer-written content the moment someone edits it, so it is stored as an
 * annotation, not as an immutable AI result.
 */

import { useCallback, useMemo, useRef } from 'react';
import { useAiPrompt, type AiPromptSource } from './aiPrompt';
import { useSharedAppState, type SharedAppStateMeta } from './appState';
import type { Row } from './types';

/** Saved under `ai-commentary:<selectionKey>` in shared app state. */
export type SharedAiCommentaryValue = {
    text: string;
    /** The prompt that generated the text; null when written by hand. */
    prompt: string | null;
    /** Server id of the generating prompt run, when the host returned one. */
    promptId: string | null;
    /** When the text was generated or first written, ISO 8601. */
    generatedAt: string;
    /** True once a person changed the text after generation. */
    edited: boolean;
};

export type SharedAiCommentaryOptions = {
    /**
     * Identifies the selection the commentary belongs to; viewers with the
     * same key see the same saved text. Build it from the selection's
     * meaningful parts with `commentarySelectionKey(...)`.
     */
    selectionKey: string;
    /** The question to generate with. Author-written; may use app state. */
    prompt: string;
    /** Results already loaded via `useLightdash`; only these are sent. */
    sources: AiPromptSource[];
    /** Narrow the generation to one row of a source. */
    focus?: { row: Row };
};

export type SharedAiCommentary = {
    /** The saved commentary for this selection, or null when none exists. */
    commentary: SharedAiCommentaryValue | null;
    /**
     * Generate with the configured prompt and save for every viewer.
     * Replaces existing commentary (the Regenerate case).
     */
    generate: () => Promise<SharedAiCommentaryValue>;
    /** Save a person's edit of the text; creates the entry when none exists. */
    saveEdit: (text: string) => void;
    /** Remove the saved commentary for this selection. */
    remove: () => void;
    /** False when the host cannot generate; saved text still loads. */
    canGenerate: boolean;
    generating: boolean;
    /** Last generation failure. Storage failures surface on `meta.error`. */
    error: Error | null;
    /** Persistence state, version and author of the last write. */
    meta: SharedAppStateMeta;
};

const KEY_PREFIX = 'ai-commentary:';
// Shared app state keys allow [A-Za-z0-9_.:-] up to 128 chars.
const SAFE_KEY_CHARS = /[^A-Za-z0-9_.:-]/g;
const MAX_SELECTION_KEY_CHARS = 128 - KEY_PREFIX.length;

/** Tiny stable digest (FNV-1a) so over-long keys stay deterministic. */
const fnv1a = (input: string): string => {
    let hash = 0x811c9dc5;
    for (let i = 0; i < input.length; i += 1) {
        hash ^= input.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
};

/**
 * Builds a storage-safe selection key from the parts that define the
 * selection (filter values, segment ids, tab names — not row data):
 *
 *   commentarySelectionKey('region', region, 'period', period)
 *
 * Parts are joined with `:`; unsafe characters are replaced and over-long
 * keys are truncated with a stable digest so equal selections always map to
 * the same key.
 */
export const commentarySelectionKey = (
    ...parts: (string | number | boolean | null | undefined)[]
): string => {
    const joined = parts
        .map((part) =>
            part === null || part === undefined ? '' : String(part),
        )
        .join(':');
    const safe = joined.replace(SAFE_KEY_CHARS, '_');
    if (safe.length === 0) return 'default';
    if (safe.length <= MAX_SELECTION_KEY_CHARS) return safe;
    const digest = fnv1a(joined);
    const head = safe.slice(0, MAX_SELECTION_KEY_CHARS - digest.length - 1);
    return `${head}-${digest}`;
};

/** Pure value builders, exported for tests. */
export const generatedCommentary = (
    result: { text: string; promptId?: string | null },
    prompt: string,
    now: Date = new Date(),
): SharedAiCommentaryValue => ({
    text: result.text,
    prompt,
    promptId: result.promptId ?? null,
    generatedAt: now.toISOString(),
    edited: false,
});

export const editedCommentary = (
    prev: SharedAiCommentaryValue | null,
    text: string,
    now: Date = new Date(),
): SharedAiCommentaryValue =>
    prev
        ? { ...prev, text, edited: true }
        : {
              text,
              prompt: null,
              promptId: null,
              generatedAt: now.toISOString(),
              edited: true,
          };

export function useSharedAiCommentary(
    options: SharedAiCommentaryOptions,
): SharedAiCommentary {
    const key = `${KEY_PREFIX}${commentarySelectionKey(options.selectionKey)}`;
    const [commentary, setCommentary, meta] =
        useSharedAppState<SharedAiCommentaryValue | null>(key, null);
    const ai = useAiPrompt();

    // Sources carry whole useLightdash results; read them at call time
    // instead of churning the callback identity every render.
    const optionsRef = useRef(options);
    optionsRef.current = options;
    const { ask } = ai;

    const generate = useCallback(async (): Promise<SharedAiCommentaryValue> => {
        const { prompt, sources, focus } = optionsRef.current;
        const result = await ask({ prompt, sources, focus });
        const value = generatedCommentary(result, prompt);
        // Updater form so a concurrent write bumps the version underneath us
        // without failing the save; the viewer asked for a fresh generation,
        // so it replaces whatever is there.
        setCommentary(() => value);
        return value;
    }, [ask, setCommentary]);

    const saveEdit = useCallback(
        (text: string) => {
            setCommentary((prev) => editedCommentary(prev, text));
        },
        [setCommentary],
    );

    const remove = useCallback(() => {
        setCommentary(() => null);
    }, [setCommentary]);

    return useMemo(
        () => ({
            commentary,
            generate,
            saveEdit,
            remove,
            // Generating saves to shared state; pointless when that is refused.
            canGenerate: ai.available && meta.error?.code !== 'forbidden',
            generating: ai.loading,
            error: ai.error,
            meta,
        }),
        [
            commentary,
            generate,
            saveEdit,
            remove,
            ai.available,
            ai.loading,
            ai.error,
            meta,
        ],
    );
}
