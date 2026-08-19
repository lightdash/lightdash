import { Anchor } from '@mantine/core';
import { Fragment, type ReactNode } from 'react';

const INLINE_LINK_REGEX = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;

/**
 * Renders `[label](https://url)` spans in plain text as anchors. Lets
 * string-only channels (e.g. persisted query errors) carry clickable
 * docs links without a markdown renderer.
 */
export const TextWithInlineLinks = ({ text }: { text: string }) => {
    const nodes: ReactNode[] = [];
    let lastIndex = 0;
    for (const match of text.matchAll(INLINE_LINK_REGEX)) {
        const [full, label, url] = match;
        if (match.index > lastIndex) {
            nodes.push(text.slice(lastIndex, match.index));
        }
        nodes.push(
            <Anchor
                key={`${url}-${match.index}`}
                href={url}
                target="_blank"
                rel="noreferrer"
                inherit
            >
                {label}
            </Anchor>,
        );
        lastIndex = match.index + full.length;
    }
    if (lastIndex < text.length) {
        nodes.push(text.slice(lastIndex));
    }
    return (
        <Fragment>
            {nodes.map((node, i) => (
                <Fragment key={i}>{node}</Fragment>
            ))}
        </Fragment>
    );
};
