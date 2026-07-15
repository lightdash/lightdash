import { Text, Textarea, useMantineColorScheme } from '@mantine-8/core';
import MarkdownPreview from '@uiw/react-markdown-preview';
import { type FC } from 'react';
import rehypeExternalLinks from 'rehype-external-links';
import classes from './MarkdownBlock.module.css';
import { type BlockComponentProps, type BuildComponentProps } from './types';

export const MarkdownBlockView: FC<BlockComponentProps> = ({ block }) => {
    const { colorScheme } = useMantineColorScheme();
    if (block.type !== 'markdown') return null;
    return (
        <div className={classes.preview} data-color-mode={colorScheme}>
            <MarkdownPreview
                source={block.config.content}
                rehypePlugins={[[rehypeExternalLinks, { target: '_blank' }]]}
            />
        </div>
    );
};

export const MarkdownBlockBuild: FC<BuildComponentProps> = ({
    block,
    onChange,
}) => {
    if (block.type !== 'markdown') return null;
    return (
        <div className={classes.editorWrap}>
            <Textarea
                aria-label="Markdown content"
                variant="unstyled"
                autosize
                minRows={4}
                maxRows={16}
                value={block.config.content}
                onChange={(e) =>
                    onChange({
                        ...block,
                        config: { content: e.currentTarget.value },
                    })
                }
                classNames={{ input: classes.editorTextarea }}
            />
            <Text className={classes.editorHint}>Markdown supported</Text>
        </div>
    );
};
