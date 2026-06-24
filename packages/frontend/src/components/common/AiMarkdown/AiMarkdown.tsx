import { Box } from '@mantine-8/core';
import { useMemo, type FC } from 'react';
import remarkEmoji from 'remark-emoji';
import remarkGfm from 'remark-gfm';
import { Streamdown, type StreamdownProps } from 'streamdown';
import 'streamdown/styles.css';
import styles from './AiMarkdown.module.css';
import { AiMarkdownErrorBoundary } from './AiMarkdownErrorBoundary';

type AiMarkdownProps = {
    /** Markdown source. */
    children: string;
    /**
     * Streaming surfaces (token-by-token SSE) opt in to the animated caret;
     * polling/static surfaces leave this false.
     */
    isStreaming?: boolean;
    /** Extra wrapper class merged onto the base `.aiMarkdown` styling. */
    className?: string;
    /** Consumer remark plugins, appended after the shared gfm + emoji base. */
    remarkPlugins?: StreamdownProps['remarkPlugins'];
    rehypePlugins?: StreamdownProps['rehypePlugins'];
    plugins?: StreamdownProps['plugins'];
    components?: StreamdownProps['components'];
};

const BASE_REMARK_PLUGINS = [remarkGfm, remarkEmoji];

/**
 * Shared streaming-aware markdown renderer for AI chat surfaces (AI agents +
 * data apps). Wraps streamdown with the Lightdash `.aiMarkdown` styling, an
 * error boundary, and gfm/emoji support. AI-agent-specific behaviour (content
 * links, SQL code blocks) is injected by the consumer via the plugin props.
 */
export const AiMarkdown: FC<AiMarkdownProps> = ({
    children,
    isStreaming = false,
    className,
    remarkPlugins,
    rehypePlugins,
    plugins,
    components,
}) => {
    const mergedRemarkPlugins = useMemo(
        () =>
            remarkPlugins
                ? [...BASE_REMARK_PLUGINS, ...remarkPlugins]
                : BASE_REMARK_PLUGINS,
        [remarkPlugins],
    );

    return (
        <Box
            className={[styles.aiMarkdown, className].filter(Boolean).join(' ')}
        >
            <AiMarkdownErrorBoundary>
                <Streamdown
                    parseIncompleteMarkdown
                    controls={false}
                    mode={isStreaming ? 'streaming' : 'static'}
                    isAnimating={isStreaming}
                    animated={!isStreaming}
                    caret={isStreaming ? 'block' : undefined}
                    remarkPlugins={mergedRemarkPlugins}
                    rehypePlugins={rehypePlugins}
                    plugins={plugins}
                    components={components}
                >
                    {children}
                </Streamdown>
            </AiMarkdownErrorBoundary>
        </Box>
    );
};
