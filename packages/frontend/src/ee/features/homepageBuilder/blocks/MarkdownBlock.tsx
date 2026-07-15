import { Box, useMantineColorScheme } from '@mantine-8/core';
import MarkdownPreview from '@uiw/react-markdown-preview';
import MDEditor from '@uiw/react-md-editor';
import { type FC } from 'react';
import rehypeExternalLinks from 'rehype-external-links';
import { type BlockComponentProps, type BuildComponentProps } from './types';

export const MarkdownBlockView: FC<BlockComponentProps> = ({ block }) => {
    const { colorScheme } = useMantineColorScheme();
    if (block.type !== 'markdown') return null;
    return (
        <Box data-color-mode={colorScheme} w="100%">
            <MarkdownPreview
                source={block.config.content}
                rehypePlugins={[[rehypeExternalLinks, { target: '_blank' }]]}
            />
        </Box>
    );
};

export const MarkdownBlockBuild: FC<BuildComponentProps> = ({
    block,
    onChange,
}) => {
    const { colorScheme } = useMantineColorScheme();
    if (block.type !== 'markdown') return null;
    return (
        <Box data-color-mode={colorScheme} w="100%">
            <MDEditor
                value={block.config.content}
                onChange={(value) =>
                    onChange({ ...block, config: { content: value ?? '' } })
                }
                preview="edit"
                minHeight={140}
                height={220}
                visibleDragbar
            />
        </Box>
    );
};
