import { type ChartKind } from '@lightdash/common';
import { IconBrandGithub, IconFile } from '@tabler/icons-react';
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import TruncatedText from '../../../../../components/common/TruncatedText';
import styles from './AgentChatInput.module.css';
import {
    FILE_MENTION_CONTENT_TYPE,
    getContentMentionContentType,
    REPOSITORY_MENTION_CONTENT_TYPE,
} from './contentMentionContentType';
import { getContentMentionIcon } from './contentMentionIcon';

export const ContentMentionNodeView = ({ node }: NodeViewProps) => {
    const contentType = getContentMentionContentType(node.attrs.contentType);
    const isFile = contentType === FILE_MENTION_CONTENT_TYPE;
    const isRepository = contentType === REPOSITORY_MENTION_CONTENT_TYPE;
    const { icon: Icon, color: iconColor } =
        isFile || isRepository
            ? { icon: isFile ? IconFile : IconBrandGithub, color: 'ldGray.6' }
            : getContentMentionIcon(
                  contentType,
                  (node.attrs.chartKind as ChartKind | null) ?? null,
              );
    const label = typeof node.attrs.label === 'string' ? node.attrs.label : '';

    return (
        <NodeViewWrapper
            as="span"
            className={styles.contentMention}
            data-content-type={contentType}
        >
            <span
                className={styles.contentMentionIcon}
                data-rendered-icon="true"
            >
                <MantineIcon
                    icon={Icon}
                    size={12}
                    color={iconColor}
                    stroke={1.8}
                />
            </span>
            <TruncatedText
                className={styles.contentMentionLabel}
                fz="inherit"
                fw="inherit"
                inline
                maxWidth={260}
                style={{ flex: 1, minWidth: 0 }}
            >
                {label}
            </TruncatedText>
        </NodeViewWrapper>
    );
};
