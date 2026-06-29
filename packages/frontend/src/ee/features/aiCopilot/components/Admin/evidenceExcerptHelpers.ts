import { type AiAgentEvidenceExcerpt } from '@lightdash/common';

export const getRenderableExcerpts = (
    excerpts: AiAgentEvidenceExcerpt[],
): AiAgentEvidenceExcerpt[] =>
    excerpts.filter(
        (excerpt) => !excerpt.redacted && excerpt.text.trim().length > 0,
    );

const CONTEXT_PREFIX = /^previous turn \([^)]*\):\s*prompt=/i;

/** Strip the "previous turn (uuid): prompt=" wrapper off context excerpts. */
export const cleanExcerptText = (text: string): string =>
    text.replace(CONTEXT_PREFIX, '').trim();
