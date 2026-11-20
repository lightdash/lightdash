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
    /** Link attributes as React props; `href` is absent while a link still streams. */
    attributes: Record<string, string>;
    text: string;
    children: ReactNode;
};

export type WordsCodeBlockRenderer = {
    languages: string[];
    component: ComponentType<WordsCodeBlockProps>;
};

export type WordsRenderContext = {
    renderLink: (link: WordsLinkProps) => ReactNode;
    codeBlocks: WordsCodeBlockRenderer[];
};

export const WordsContext = createContext<WordsRenderContext | null>(null);

export const useWordsContext = (): WordsRenderContext => {
    const context = useContext(WordsContext);
    if (!context) throw new Error('WordsContext is missing');
    return context;
};
