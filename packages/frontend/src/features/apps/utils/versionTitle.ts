const VERSION_TITLE_MAX = 120;

/** A prompt's headline sentence and the rest, links reduced to their text. */
export const splitVersionPrompt = (
    prompt: string | undefined,
): { headline: string | null; rest: string | null } => {
    const plain = (prompt ?? '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
    const sentences = plain
        .trim()
        .split(/(?<=[.!?])(?<!\b(?:e\.g|i\.e|etc|vs)\.)\s+|\n+/)
        .map((t) => t.trim())
        .filter((t) => t !== '');
    // Skip filler openers like "Nice." or "Thanks!".
    const index = Math.max(
        0,
        sentences.findIndex((t) => t.split(/\s+/).length >= 3),
    );
    const headline = sentences[index] ?? null;
    const rest = sentences.slice(index + 1).join(' ');
    return { headline, rest: rest === '' ? null : rest };
};

/** A version's checkpoint title: the headline sentence of its prompt. */
export const versionTitle = (
    prompt: string | undefined,
    version: number,
): string => {
    const { headline } = splitVersionPrompt(prompt);
    if (headline === null) return `Version ${version}`;
    return headline.length > VERSION_TITLE_MAX
        ? `${headline.slice(0, VERSION_TITLE_MAX).trimEnd()}…`
        : headline;
};
