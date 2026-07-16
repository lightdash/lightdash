import { Text } from '@mantine-8/core';
import { type FC } from 'react';
import { AiMarkdown } from '../../../../components/common/AiMarkdown/AiMarkdown';
import classes from './MarkdownBlock.module.css';
import { TiptapMarkdownEditor } from './markdownEditor/TiptapMarkdownEditor';
import { type BlockComponentProps, type BuildComponentProps } from './types';

export const MarkdownBlockView: FC<BlockComponentProps> = ({ block }) => {
    if (block.type !== 'markdown') return null;
    return (
        <div className={classes.preview}>
            <AiMarkdown>{block.config.content}</AiMarkdown>
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
            <TiptapMarkdownEditor
                content={block.config.content}
                onChange={(markdown) =>
                    onChange({
                        ...block,
                        config: { content: markdown },
                    })
                }
            />
            <Text className={classes.editorHint}>
                Type &quot;/&quot; for commands
            </Text>
        </div>
    );
};
