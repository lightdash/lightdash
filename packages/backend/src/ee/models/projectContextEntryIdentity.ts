import type { ProjectContextEntry } from '@lightdash/common';
import { createHash } from 'crypto';

/** How many hex chars of the content hash the citation slug carries. */
export const PROJECT_CONTEXT_HASH_PREFIX_LENGTH = 8;

/** Longest cosmetic prefix a slug keeps from the file id. */
const SLUG_PREFIX_MAX_LENGTH = 40;

const HASH_PREFIX_PATTERN = new RegExp(
    `^[0-9a-f]{${PROJECT_CONTEXT_HASH_PREFIX_LENGTH}}$`,
);

/**
 * Identity input: trimmed, with internal whitespace collapsed, so YAML
 * round-trips (re-wrapping, indentation) don't shift an entry's identity.
 */
export const normalizeProjectContextContent = (content: string): string =>
    content.trim().replace(/\s+/g, ' ');

/**
 * Content hash of an entry. Only content and kind participate: terms and
 * objects are retrieval metadata, updated in place on the same row.
 */
export const hashProjectContextEntry = (
    entry: Pick<ProjectContextEntry, 'content' | 'kind'>,
): string =>
    createHash('sha256')
        .update(
            `${normalizeProjectContextContent(entry.content)}\n${entry.kind}`,
        )
        .digest('hex');

const slugifyPrefix = (fileId: string): string => {
    const kebab = fileId
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    return kebab.slice(0, SLUG_PREFIX_MAX_LENGTH).replace(/-+$/g, '');
};

/**
 * `{file-id}-{hash8}`. The prefix is cosmetic — it makes the slug readable in
 * logs and copyable by the model — while the hash suffix carries identity.
 */
export const buildProjectContextEntrySlug = (
    fileId: string,
    hash: string,
): string => {
    const prefix = slugifyPrefix(fileId);
    const suffix = hash.slice(0, PROJECT_CONTEXT_HASH_PREFIX_LENGTH);
    return prefix === '' ? `entry-${suffix}` : `${prefix}-${suffix}`;
};

/**
 * Pull the hash prefix out of a citation slug. Resolution matches on this
 * alone, so a renamed file id never breaks a persisted citation.
 */
export const parseProjectContextEntrySlug = (slug: string): string | null => {
    const suffix = slug.trim().toLowerCase().split('-').pop();
    if (!suffix || !HASH_PREFIX_PATTERN.test(suffix)) {
        return null;
    }
    return suffix;
};
