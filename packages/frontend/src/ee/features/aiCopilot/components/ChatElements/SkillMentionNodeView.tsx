import { IconBolt } from '@tabler/icons-react';
import { type NodeViewProps, NodeViewWrapper } from '@tiptap/react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import styles from './AgentChatInput.module.css';

export const SkillMentionNodeView = ({ node }: NodeViewProps) => {
    const name = typeof node.attrs.name === 'string' ? node.attrs.name : '';
    const hint =
        typeof node.attrs.argumentHint === 'string'
            ? node.attrs.argumentHint
            : null;
    return (
        <NodeViewWrapper
            as="span"
            className={styles.contentMention}
            data-content-type="skill"
            title={hint ? `Arguments: ${hint}` : undefined}
        >
            <span
                className={styles.contentMentionIcon}
                data-rendered-icon="true"
            >
                <MantineIcon
                    icon={IconBolt}
                    size={12}
                    color="indigo.6"
                    stroke={1.8}
                />
            </span>
            <span className={styles.contentMentionLabel}>/{name}</span>
        </NodeViewWrapper>
    );
};
