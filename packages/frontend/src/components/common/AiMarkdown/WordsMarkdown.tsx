import { Box } from '@mantine/core';
import { createHtmlRenderer } from '@pierre/words/html';
import clsx from 'clsx';
import { memo, useId, useMemo, useRef, type FC, type ReactNode } from 'react';
import styles from './AiMarkdown.module.css';
import {
    WordsContext,
    type WordsCodeBlockRenderer,
    type WordsLinkProps,
} from './wordsContext';
import { wordsHtmlToReact } from './wordsHtmlToReact';

type WordsRenderer = ReturnType<typeof createHtmlRenderer>;

type StableBlocks = { revision: number; chunks: string[] };

type WordsMarkdownProps = {
    children: string;
    isStreaming: boolean;
    className?: string;
    renderLink?: (link: WordsLinkProps) => ReactNode;
    codeBlocks?: WordsCodeBlockRenderer[];
};

// Raw tags agents use that Streamdown's sanitizer also keeps; Words drops the rest.
const ALLOWED_HTML = {
    br: [],
    sup: [],
    sub: [],
    kbd: [],
    b: [],
    i: [],
    s: [],
    del: [],
    ins: [],
    details: ['open'],
    summary: [],
};

const RENDER_OPTIONS = {
    controls: false,
    lineNumbers: false,
    allowedHtml: ALLOWED_HTML,
};
const NO_CODE_BLOCKS: WordsCodeBlockRenderer[] = [];

const renderPlainLink = ({ href, children }: WordsLinkProps) => (
    <a href={href} target="_blank" rel="noreferrer noopener">
        {children}
    </a>
);

/** Completed blocks never change, so each revision's addition is converted once. */
const renderBlocks = (
    renderer: WordsRenderer,
    stable: StableBlocks,
    source: string,
    isStreaming: boolean,
) => {
    const update = renderer.render(source, isStreaming, isStreaming);
    if (update.revision !== stable.revision) {
        if (update.reset || update.revision !== stable.revision + 1) {
            stable.chunks = update.stable ? [update.stable] : [];
        } else if (update.addition) {
            stable.chunks = [...stable.chunks, update.addition];
        }
        stable.revision = update.revision;
    }
    return { chunks: stable.chunks, pending: update.pending };
};

const WordsChunk: FC<{ html: string; withCaret: boolean }> = memo(
    ({ html, withCaret }) => (
        <>
            {useMemo(
                () => wordsHtmlToReact(html, { withCaret }),
                [html, withCaret],
            )}
        </>
    ),
);

/** Agent answers parsed by `@pierre/words` (Wasm) and rendered by React, so links and code blocks can be components. */
export const WordsMarkdown: FC<WordsMarkdownProps> = ({
    children,
    isStreaming,
    className,
    renderLink = renderPlainLink,
    codeBlocks = NO_CODE_BLOCKS,
}) => {
    // Footnote ids are per answer, or a later answer's footnote jumps to the first.
    const idPrefix = `${useId().replace(/[^\w-]/g, '')}-`;
    const rendererRef = useRef<WordsRenderer | null>(null);
    const stableRef = useRef<StableBlocks>({ revision: -1, chunks: [] });

    const { chunks, pending } = useMemo(() => {
        rendererRef.current ??= createHtmlRenderer({
            ...RENDER_OPTIONS,
            idPrefix,
        });
        return renderBlocks(
            rendererRef.current,
            stableRef.current,
            children,
            isStreaming,
        );
    }, [children, idPrefix, isStreaming]);
    const context = useMemo(
        () => ({ renderLink, codeBlocks }),
        [renderLink, codeBlocks],
    );

    return (
        <Box className={clsx(styles.aiMarkdown, className)}>
            <WordsContext.Provider value={context}>
                {/* Mirrors Streamdown's root div, which the .aiMarkdown CSS expects. */}
                <Box>
                    {chunks.map((html, index) => (
                        <WordsChunk key={index} html={html} withCaret={false} />
                    ))}
                    <WordsChunk html={pending} withCaret={isStreaming} />
                </Box>
            </WordsContext.Provider>
        </Box>
    );
};
