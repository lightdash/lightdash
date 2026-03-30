import { useMantineColorScheme } from '@mantine-8/core';
import MarkdownPreview from '@uiw/react-markdown-preview';
import type { Root } from 'hast';
import React, { type FC } from 'react';
import rehypeExternalLinks from 'rehype-external-links';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import type { Plugin } from 'unified';
import styles from './RichTextCell.module.css';

interface RichTextCellProps {
    content: string;
}

// Extend the default GitHub-style sanitization schema to allow inline styles
const sanitizeSchema = {
    ...defaultSchema,
    attributes: {
        ...defaultSchema.attributes,
        '*': [...(defaultSchema.attributes?.['*'] || []), 'style'],
    },
};

// Custom rehype plugin to trim leading/trailing newlines from text nodes
// This helps with multi-line HTML in templates while preserving content structure
const rehypeRemoveLineBreaks: Plugin<[], Root> = () => {
    return (tree) => {
        // Recursive function to walk the tree
        function walk(node: any): void {
            // Trim leading and trailing newlines from text nodes
            if (node.type === 'text' && node.value) {
                // Remove newlines and whitespace only from start and end
                node.value = node.value
                    .replace(/^\s*\n+/, '')
                    .replace(/\n+\s*$/, '');
            }

            // Recursively process children
            if (node.children && Array.isArray(node.children)) {
                node.children.forEach(walk);
            }
        }

        walk(tree);
    };
};

const RichTextCell: FC<RichTextCellProps> = ({ content }) => {
    const { colorScheme } = useMantineColorScheme();

    // Stop click propagation on links to prevent table cell selection
    const handleClick = (e: React.MouseEvent) => {
        const target = e.target as HTMLElement;
        // Check if the clicked element is a link or inside a link
        if (target.tagName === 'A' || target.closest('a')) {
            e.stopPropagation();
        }
    };

    return (
        <div
            data-color-mode={colorScheme}
            className={styles.richTextCell}
            onClick={handleClick}
        >
            <MarkdownPreview
                source={content}
                skipHtml={false}
                rehypePlugins={[
                    rehypeRemoveLineBreaks,
                    rehypeRaw,
                    [rehypeSanitize, sanitizeSchema],
                    [rehypeExternalLinks, { target: '_blank' }],
                ]}
            />
        </div>
    );
};

export default RichTextCell;
