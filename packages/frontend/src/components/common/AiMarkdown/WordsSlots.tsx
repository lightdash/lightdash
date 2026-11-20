import { type FC, type ReactNode } from 'react';
import {
    useWordsContext,
    type WordsCodeBlockProps,
    type WordsLinkProps,
} from './wordsContext';

// Slots read renderers from context, so converted HTML stays cached while renderers change.
export const LinkSlot: FC<WordsLinkProps> = (link) => (
    <>{useWordsContext().renderLink(link)}</>
);

export const CodeBlockSlot: FC<
    WordsCodeBlockProps & { fallback: ReactNode }
> = ({ fallback, ...block }) => {
    const { codeBlocks } = useWordsContext();
    const renderer = codeBlocks.find(({ languages }) =>
        languages.includes(block.language),
    );
    return renderer ? <renderer.component {...block} /> : <>{fallback}</>;
};
