/**
 * Following a cited docs text that moved (CS-400).
 *
 * A step cites its text by position: `page.mdx#anchor`, then optionally a
 * paragraph (`:p3`) or list item (`:li2`) and a sentence or sentence range
 * (`:1`, `:1-2`). When the docs put a paragraph above a cited one, the text is
 * the same but its position is not. A docs bump finds such a text at its new
 * place and rewrites the citation, so the step keeps showing the same words.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { docsParagraph, docsSection } from './lib';

/**
 * A citation as the frontend source writes it: a quoted string, whether a
 * marker attribute (`data-tour-docs="..."`), an object-literal value or a
 * lesson's constant.
 */
const CITATION =
    /(['"])([\w./-]+\.mdx#[a-z0-9-]+(?::(?:p\d+|li\d+|\d+(?:-\d+)?))*)\1/g;

/** The citations in a source text, each once, in the order met. */
export const findCitations = (source: string): string[] => [
    ...new Set([...source.matchAll(CITATION)].map((match) => match[2])),
];

/**
 * A source text with every moved citation rewritten. One pass over the text:
 * a new value can be another citation's old value (`:p3` becomes `:p5` while
 * `:p5` becomes `:p7`), and must not be rewritten again.
 */
export const rewriteCitations = (
    source: string,
    moves: Map<string, string>,
): string =>
    source.replace(
        CITATION,
        (match, quote: string, ref: string) =>
            `${quote}${moves.get(ref) ?? ref}${quote}`,
    );

/** What a citation shows with the docs as they are; undefined when it does not resolve. */
const read = (ref: string): string | undefined => {
    try {
        return docsParagraph(ref);
    } catch {
        return undefined;
    }
};

/**
 * The text each citation shows with the docs as they are. A citation that
 * does not resolve is left out: there is no text of its to follow.
 */
export const citedTexts = (refs: string[]): Map<string, string> =>
    new Map(
        refs.flatMap((ref) => {
            const text = read(ref);
            return text === undefined ? [] : [[ref, text] as const];
        }),
    );

/**
 * Where the text a citation showed now sits, when the docs moved it inside
 * its section without changing it. `was` is the text it showed at the old
 * docs commit; the docs checkout is at the new one.
 *
 * Undefined when the citation still shows that text, and when the text is
 * not at exactly one place in the section: the docs edited it, it is there
 * twice, or the heading or the page is gone. The search covers every
 * paragraph and list item, and for a sentence citation every run of as many
 * sentences. So a followed citation never changes what a learner reads.
 */
export const movedCitation = (ref: string, was: string): string | undefined => {
    if (read(ref) === was) return undefined;
    const [page, rest] = ref.split('#');
    const [anchor, ...selectors] = rest.split(':');
    const range = selectors.find((x) => /^\d+(-\d+)?$/.test(x));
    const namesParagraph = selectors.some((x) => /^p\d+$/.test(x));
    // The first paragraph is written with no `:p1` unless the citation
    // already named its paragraph.
    const place = (kind: string, n: number) =>
        kind === 'p' && n === 1 && !namesParagraph
            ? `${page}#${anchor}`
            : `${page}#${anchor}:${kind}${n}`;
    const [from, to] = (range ?? '').split('-').map(Number);
    const length = (to ?? from) - from + 1;
    // Every paragraph and list item of the section, by count: one that
    // cannot be shown in a card must not hide the ones after it.
    let section: ReturnType<typeof docsSection>;
    try {
        section = docsSection(ref);
    } catch {
        return undefined;
    }
    const places = [
        ...section.prose.map((_, index) => place('p', index + 1)),
        ...section.items.map((_, index) => place('li', index + 1)),
    ];
    const found: string[] = [];
    for (const at of places) {
        if (!range) {
            if (read(at) === was) found.push(at);
        } else {
            // Every run of as many sentences as the citation showed.
            for (let start = 1; ; start += 1) {
                const candidate = `${at}:${
                    length === 1 ? start : `${start}-${start + length - 1}`
                }`;
                const text = read(candidate);
                if (text === undefined) break;
                if (text === was) found.push(candidate);
            }
        }
    }
    return found.length === 1 ? found[0] : undefined;
};

/**
 * Old citation to new, for every citation whose text moved. `was` is what
 * each showed at the old docs commit (citedTexts, read before the docs
 * checkout moved on).
 */
export const citationMoves = (was: Map<string, string>): Map<string, string> =>
    new Map(
        [...was].flatMap(([ref, text]) => {
            const to = movedCitation(ref, text);
            return to === undefined ? [] : [[ref, to] as const];
        }),
    );

/**
 * The TypeScript source files under a directory that hold a citation, with
 * the citations in each. Sorted, so a bump reports its moves in one order.
 */
export const citationSources = (dir: string): Map<string, string[]> =>
    new Map(
        readdirSync(dir)
            .sort()
            .flatMap((entry): [string, string[]][] => {
                const full = path.join(dir, entry);
                if (statSync(full).isDirectory()) {
                    return entry === 'node_modules'
                        ? []
                        : [...citationSources(full)];
                }
                if (!/\.tsx?$/.test(entry)) return [];
                const refs = findCitations(readFileSync(full, 'utf8'));
                return refs.length > 0 ? [[full, refs]] : [];
            }),
    );

export type AppliedMove = { from: string; to: string; files: string[] };

/**
 * Rewrites the moved citations in the source files that hold them. Returns
 * each move with the files it was made in.
 */
export const applyCitationMoves = (
    sources: Map<string, string[]>,
    moves: Map<string, string>,
): AppliedMove[] => {
    const applied = [...moves].map(([from, to]) => ({
        from,
        to,
        files: [...sources]
            .filter(([, refs]) => refs.includes(from))
            .map(([file]) => file),
    }));
    new Set(applied.flatMap((move) => move.files)).forEach((file) =>
        writeFileSync(
            file,
            rewriteCitations(readFileSync(file, 'utf8'), moves),
        ),
    );
    return applied;
};
