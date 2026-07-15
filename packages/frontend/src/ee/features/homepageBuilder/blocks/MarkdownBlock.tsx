import { type HomepageMarkdownBlock } from '@lightdash/common';
import { Box, useMantineColorScheme } from '@mantine-8/core';
import MarkdownPreview from '@uiw/react-markdown-preview';
import MDEditor from '@uiw/react-md-editor';
import { type FC } from 'react';
import rehypeExternalLinks from 'rehype-external-links';

export const MarkdownBlockView: FC<{ block: HomepageMarkdownBlock }> = ({
    block,
}) => {
    const { colorScheme } = useMantineColorScheme();
    return (
        <Box data-color-mode={colorScheme} w="100%">
            <MarkdownPreview
                source={block.config.content}
                rehypePlugins={[[rehypeExternalLinks, { target: '_blank' }]]}
            />
        </Box>
    );
};

export const MarkdownBlockBuild: FC<{
    block: HomepageMarkdownBlock;
    onChange: (config: HomepageMarkdownBlock['config']) => void;
}> = ({ block, onChange }) => {
    const { colorScheme } = useMantineColorScheme();
    return (
        <Box data-color-mode={colorScheme} w="100%">
            <MDEditor
                value={block.config.content}
                onChange={(value) => onChange({ content: value ?? '' })}
                preview="edit"
                minHeight={140}
                height={220}
                visibleDragbar
            />
        </Box>
    );
};
