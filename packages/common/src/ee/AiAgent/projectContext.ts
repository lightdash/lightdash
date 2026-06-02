import Ajv from 'ajv';
import AjvErrors from 'ajv-errors';
import betterAjvErrors from 'better-ajv-errors';
import * as yaml from 'js-yaml';
import { z } from 'zod';
import lightdashProjectContextSchema from '../../schemas/json/lightdash-project-context-1.0.json';
import { ParseError } from '../../types/errors';

// Two kinds, by retrieval intent: `definition` is term-triggered (acronyms,
// vocabulary, "X means Y"); `context` is the object-scoped catch-all
// (routing/join rules, guidance, durable facts). Splitting out more kinds later
// is additive.
export const projectContextEntryKinds = ['definition', 'context'] as const;

// Top-level file version. The file is `{ version, entries }`; bumping this is
// the escape hatch for a future hard schema break, without per-entry churn.
export const PROJECT_CONTEXT_FILE_VERSION = 1;

// Canonical, post-ingest entry: `id` is always present (derived if the file
// omitted it). This is what selection, the cache, and the API speak.
export const projectContextEntrySchema = z.object({
    id: z.string().min(1),
    kind: z.enum(projectContextEntryKinds),
    content: z.string().min(1),
    terms: z.array(z.string()).default([]),
    objects: z.array(z.string()).default([]),
});

export type ProjectContextEntry = z.infer<typeof projectContextEntrySchema>;

// File-input shape, deliberately lax for human authors: `id` is optional
// (derived at ingest) and unknown keys are preserved so a field a newer
// Lightdash adds round-trips instead of being silently dropped. The legacy
// `global` key is stripped explicitly during load.
type ProjectContextFileEntry = Omit<
    ProjectContextEntry,
    'id' | 'terms' | 'objects'
> & {
    id?: string;
    terms?: string[];
    objects?: string[];
    [key: string]: unknown;
};

// Judge-emitted write-path entry (op + nullable id, no global). Mirrors
// aiAgentJudgeProjectContextEntrySchema; redeclared here to keep this module
// free of the review-classifier types.
export type ProjectContextWritebackEntry = {
    op: 'create' | 'update';
    id: string | null;
    kind: ProjectContextEntry['kind'];
    content: string;
    terms: string[];
    objects: string[];
};

const slugifyId = (value: string): string =>
    value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

/**
 * Apply a judge-emitted entry to the current file entries, by id. A create with
 * no id derives a stable id from the first term/content (suffixed on collision);
 * an explicit id that already exists updates in place (dedup backstop).
 */
export const mergeProjectContextEntry = (
    existing: ProjectContextEntry[],
    judgeEntry: ProjectContextWritebackEntry,
): {
    entries: ProjectContextEntry[];
    entryId: string;
    op: 'create' | 'update';
} => {
    const ids = new Set(existing.map((e) => e.id));
    if (judgeEntry.op === 'update' && !judgeEntry.id) {
        throw new Error('Project context update requires an entry id');
    }

    let entryId: string;
    if (judgeEntry.id) {
        entryId = judgeEntry.id;
    } else {
        const base =
            slugifyId(judgeEntry.terms[0] ?? judgeEntry.content) ||
            judgeEntry.kind;
        entryId = base;
        let suffix = 1;
        while (ids.has(entryId)) {
            entryId = `${base}-${suffix}`;
            suffix += 1;
        }
    }

    const index = existing.findIndex((e) => e.id === entryId);
    const op: 'create' | 'update' = index >= 0 ? 'update' : 'create';
    const merged: ProjectContextEntry = {
        id: entryId,
        kind: judgeEntry.kind,
        content: judgeEntry.content,
        terms: judgeEntry.terms,
        objects: judgeEntry.objects,
    };

    const entries =
        index >= 0
            ? existing.map((e, i) => (i === index ? merged : e))
            : [...existing, merged];

    return { entries, entryId, op };
};

export const serializeProjectContextFile = (
    entries: ProjectContextEntry[],
): string => {
    if (entries.length === 0) {
        return '';
    }
    return yaml.dump(
        { version: PROJECT_CONTEXT_FILE_VERSION, entries },
        { lineWidth: -1 },
    );
};

// Derive a stable id from the first term (or content) when the author omitted
// one, suffixing on collision so ids stay unique within the file.
const deriveEntryId = (
    entry: { id?: string; terms: string[]; content: string },
    used: Set<string>,
): string => {
    const base = entry.id ?? slugifyId(entry.terms[0] ?? entry.content);
    const fallback = base === '' ? 'entry' : base;
    let id = fallback;
    let suffix = 1;
    while (used.has(id)) {
        id = `${fallback}-${suffix}`;
        suffix += 1;
    }
    return id;
};

/**
 * Load project_context YAML contents. Accepts the canonical `{ version, entries }`
 * shape and a legacy bare-array file. Invalid files throw with schema-backed
 * errors, and `id` is derived when absent.
 */
export const loadProjectContextFile = (
    yamlContents: string,
): ProjectContextEntry[] => {
    if (yamlContents.trim() === '') {
        return [];
    }

    let loaded: unknown;
    try {
        loaded = yaml.load(yamlContents);
    } catch (e) {
        throw new ParseError(
            `Invalid lightdash.project_context.yml: ${
                e instanceof Error ? e.message : 'failed to parse YAML'
            }`,
        );
    }

    const ajv = new Ajv({
        coerceTypes: true,
        allErrors: true,
        allowUnionTypes: true,
    });
    AjvErrors(ajv);
    const validate = ajv.compile(lightdashProjectContextSchema);

    if (!validate(loaded)) {
        const errors = betterAjvErrors(
            lightdashProjectContextSchema,
            loaded,
            validate.errors || [],
            { indent: 2 },
        );
        throw new ParseError(
            `Invalid lightdash.project_context.yml with errors:\n${errors}`,
        );
    }

    const rawEntries = (
        Array.isArray(loaded)
            ? loaded
            : (loaded as { entries: unknown[] }).entries
    ) as ProjectContextFileEntry[];
    const entries: ProjectContextEntry[] = [];
    const usedIds = new Set<string>();
    for (const item of rawEntries) {
        const entry = { ...item };
        const explicitId = entry.id;
        const terms = entry.terms ?? [];
        const objects = entry.objects ?? [];
        delete entry.id;
        delete entry.global;

        const id = deriveEntryId(
            { id: explicitId, terms, content: entry.content },
            usedIds,
        );
        usedIds.add(id);
        entries.push({ ...entry, id, terms, objects });
    }
    return entries;
};
