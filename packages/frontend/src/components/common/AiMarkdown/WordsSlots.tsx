import { type FC, type ReactNode } from 'react';
import {
    TOKEN_REGEX,
    useWordsContext,
    type WordsCodeBlockProps,
    type WordsLinkProps,
} from './wordsContext';

// Slots read renderers from context, so converted HTML stays cached while renderers change.
export const LinkSlot: FC<WordsLinkProps> = (link) => (
    <>{useWordsContext().renderLink(link)}</>
);

export const InlineTagSlot: FC<{ index: number }> = ({ index }) => {
    const { tokens, inlineTags } = useWordsContext();
    const token = tokens[index];
    const render = token ? inlineTags[token.name] : undefined;
    return render ? <>{render(token.attributes)}</> : null;
};

export const CodeBlockSlot: FC<
    WordsCodeBlockProps & { fallback: ReactNode }
> = ({ fallback, ...block }) => {
    const { codeBlocks } = useWordsContext();
    const renderer = codeBlocks.find(({ languages }) =>
        languages.includes(block.language),
    );
    return renderer ? <renderer.component {...block} /> : <>{fallback}</>;
};

/** Inline tags written inside code show as their source text. */
export const RawTokenText: FC<{ text: string }> = ({ text }) => {
    const { tokens } = useWordsContext();
    return (
        <>{text.replace(TOKEN_REGEX, (_, i) => tokens[Number(i)]?.raw ?? '')}</>
    );
};
