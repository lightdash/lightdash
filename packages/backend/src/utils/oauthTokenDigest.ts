import { createHash } from 'node:crypto';

export const isDigestForm = (value: string): boolean => /^sha256:/i.test(value);

export const toStoredDigest = (presented: string): string =>
    `sha256:${createHash('sha256').update(presented, 'utf8').digest('hex')}`;

// Repeated form fields and query objects arrive as non-strings despite the type; they match nothing.
export const getStoredTokenCandidates = (presented: string): string[] =>
    typeof presented !== 'string' || isDigestForm(presented)
        ? []
        : [presented, toStoredDigest(presented)];
