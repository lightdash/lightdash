import { Box } from '@mantine/core';
import { useMemo, type FC } from 'react';
import remarkEmoji from 'remark-emoji';
import remarkGfm from 'remark-gfm';
import {
    defaultRehypePlugins,
    Streamdown,
    type StreamdownProps,
} from 'streamdown';
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
    allowedTags?: StreamdownProps['allowedTags'];
};

const BASE_REMARK_PLUGINS = [remarkGfm, remarkEmoji];

// Streamdown's default link renderer is a <button> that opens an inline
// "open external link?" confirmation, both styled with Tailwind classes we
// don't ship — so links degrade to native button chrome. Render plain
// anchors by default; consumers with richer behavior (e.g. agent chat's
// ContentLink pills) override `components.a`.
const DEFAULT_COMPONENTS: StreamdownProps['components'] = {
    a: ({ node: _node, children, ...props }) => (
        <a {...props} target="_blank" rel="noreferrer noopener">
            {children}
        </a>
    ),
};

type SanitizeSchema = {
    tagNames?: string[];
    attributes?: Record<string, unknown>;
    [key: string]: unknown;
};

const withAllowedTags = (
    rehypePlugins: NonNullable<StreamdownProps['rehypePlugins']>,
    allowedTags: NonNullable<StreamdownProps['allowedTags']>,
): StreamdownProps['rehypePlugins'] => {
    const [sanitizePlugin, schema] =
        defaultRehypePlugins.sanitize as unknown as [unknown, SanitizeSchema];

    return [
        defaultRehypePlugins.raw,
        [
            sanitizePlugin,
            {
                ...schema,
                tagNames: [
                    ...(schema.tagNames ?? []),
                    ...Object.keys(allowedTags),
                ],
                attributes: {
                    ...schema.attributes,
                    ...allowedTags,
                },
            },
        ],
        defaultRehypePlugins.harden,
        ...rehypePlugins,
    ] as StreamdownProps['rehypePlugins'];
};

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
    allowedTags,
}) => {
    const mergedRemarkPlugins = useMemo(
        () =>
            remarkPlugins
                ? [...BASE_REMARK_PLUGINS, ...remarkPlugins]
                : BASE_REMARK_PLUGINS,
        [remarkPlugins],
    );
    const mergedRehypePlugins = useMemo(
        () =>
            rehypePlugins && allowedTags
                ? withAllowedTags(rehypePlugins, allowedTags)
                : rehypePlugins,
        [allowedTags, rehypePlugins],
    );
    const mergedComponents = useMemo(
        () => ({ ...DEFAULT_COMPONENTS, ...components }),
        [components],
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
                    rehypePlugins={mergedRehypePlugins}
                    plugins={plugins}
                    components={mergedComponents}
                    allowedTags={allowedTags}
                >
                    {children}
                </Streamdown>
            </AiMarkdownErrorBoundary>
        </Box>
    );
};
