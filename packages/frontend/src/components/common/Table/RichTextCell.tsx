import { useMantineColorScheme } from '@mantine-8/core';
import MarkdownPreview from '@uiw/react-markdown-preview';
import type { Root } from 'hast';
import React, { type FC } from 'react';
import rehypeExternalLinks from 'rehype-external-links';
import type { Plugin } from 'unified';
import styles from './RichTextCell.module.css';

interface RichTextCellProps {
    content: string;
}

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

    return (
        <div data-color-mode={colorScheme} className={styles.richTextCell}>
            <MarkdownPreview
                source={content}
                rehypePlugins={[
                    rehypeRemoveLineBreaks,
                    [rehypeExternalLinks, { target: '_blank' }],
                ]}
            />
        </div>
    );
};

export default RichTextCell;
