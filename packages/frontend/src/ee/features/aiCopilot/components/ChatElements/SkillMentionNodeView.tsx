import { interpolateUiString } from '@lightdash/common';
import { Box } from '@mantine/core';
import { IconLicense } from '@tabler/icons-react';
import { type NodeViewProps, NodeViewWrapper } from '@tiptap/react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { useUiStrings } from '../../../../providers/Embed/useUiStrings';
import styles from './AgentChatInput.module.css';

export const SkillMentionNodeView = ({ node }: NodeViewProps) => {
    const strings = useUiStrings();
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
            title={
                hint
                    ? interpolateUiString(strings('skillChip.arguments'), {
                          hint,
                      })
                    : undefined
            }
        >
            <Box
                component="span"
                className={styles.contentMentionIcon}
                data-rendered-icon="true"
            >
                <MantineIcon
                    icon={IconLicense}
                    size={12}
                    color="indigo.6"
                    stroke={1.8}
                />
            </Box>
            <Box component="span" className={styles.contentMentionLabel}>
                /{name}
            </Box>
        </NodeViewWrapper>
    );
};
