export const NODE_CITATION_FRAGMENT = '#query-node-';

const NODE_CITATION_HREF_REGEX = new RegExp(
    `^${NODE_CITATION_FRAGMENT}([a-zA-Z_][a-zA-Z0-9_]{0,62})$`,
);
const MARKDOWN_CODE = '```[\\s\\S]*?```|~~~[\\s\\S]*?~~~|`[^`\\n]*`';
const NODE_CITATION_LINK = `\\[((?:[^\\[\\]]|\\[[^\\]]*\\])*)\\]\\(${NODE_CITATION_FRAGMENT}[^)\\s]*\\)`;

const codeOrCitationRegex = () =>
    new RegExp(`(${MARKDOWN_CODE})|${NODE_CITATION_LINK}`, 'g');

export const getNodeCitationNodeId = (href: string): string | null =>
    href.match(NODE_CITATION_HREF_REGEX)?.[1] ?? null;

export const hasNodeCitations = (markdown: string): boolean =>
    Array.from(markdown.matchAll(codeOrCitationRegex())).some(
        ([, code]) => code === undefined,
    );

/** Removes citation link syntax, keeping the text, for surfaces that can't render it. */
export const stripNodeCitations = (markdown: string): string =>
    markdown.replace(
        codeOrCitationRegex(),
        (_match, code: string | undefined, figure: string) => code ?? figure,
    );
