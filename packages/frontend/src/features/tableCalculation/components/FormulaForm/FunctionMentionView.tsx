import { Tooltip } from '@mantine-8/core';
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import type { FC } from 'react';
import styles from './FormulaEditor.module.css';

type FunctionMentionAttrs = {
    id: string;
    label?: string;
    tooltip?: string;
};

export const FunctionMentionView: FC<NodeViewProps> = ({ node }) => {
    const { id, tooltip } = node.attrs as FunctionMentionAttrs;

    return (
        <NodeViewWrapper as="span" className={styles.functionLabelWrapper}>
            <Tooltip
                label={tooltip ?? ''}
                multiline
                maw={320}
                withArrow
                position="bottom-start"
                disabled={!tooltip}
            >
                <span className={styles.functionLabel}>{id}</span>
            </Tooltip>
        </NodeViewWrapper>
    );
};
