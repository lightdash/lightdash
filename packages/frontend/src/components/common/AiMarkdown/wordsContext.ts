import {
    createContext,
    useContext,
    type ComponentType,
    type ReactNode,
} from 'react';

export type WordsCodeBlockProps = {
    code: string;
    language: string;
    isIncomplete: boolean;
};

export type WordsLinkProps = {
    /** Parsed link attributes; `href` is absent while a link is still streaming. */
    attributes: Record<string, string>;
    text: string;
    children: ReactNode;
};

export type WordsCodeBlockRenderer = {
    languages: string[];
    component: ComponentType<WordsCodeBlockProps>;
};

export type WordsInlineTagRenderer = (
    attributes: Record<string, string>,
) => ReactNode;

export type InlineTagToken = {
    name: string;
    attributes: Record<string, string>;
    raw: string;
};

export type WordsRenderContext = {
    renderLink: (link: WordsLinkProps) => ReactNode;
    codeBlocks: WordsCodeBlockRenderer[];
    inlineTags: Record<string, WordsInlineTagRenderer>;
    tokens: InlineTagToken[];
};

/** Private-use characters that survive Words untouched, marking an inline tag by index. */
export const TOKEN_START = String.fromCharCode(0xe000);
export const TOKEN_END = String.fromCharCode(0xe001);
export const TOKEN_REGEX = new RegExp(`${TOKEN_START}(\\d+)${TOKEN_END}`, 'g');

export const WordsContext = createContext<WordsRenderContext | null>(null);

export const useWordsContext = (): WordsRenderContext => {
    const context = useContext(WordsContext);
    if (!context) throw new Error('WordsContext is missing');
    return context;
};
