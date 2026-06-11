import { ContentType, type ChartKind } from '@lightdash/common';
import { IconFile, IconLayoutDashboard } from '@tabler/icons-react';
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { getChartIcon } from '../../../../../components/common/ResourceIcon/utils';
import TruncatedText from '../../../../../components/common/TruncatedText';
import styles from './AgentChatInput.module.css';

// File mentions reuse this node so they get the same pill chrome; they're
// distinguished by a `file` contentType and carry the path in `label`.
const FILE_CONTENT_TYPE = 'file';

const getContentMentionContentType = (value: unknown) => {
    if (value === FILE_CONTENT_TYPE) return FILE_CONTENT_TYPE;
    return value === ContentType.DASHBOARD
        ? ContentType.DASHBOARD
        : ContentType.CHART;
};

export const ContentMentionNodeView = ({ node }: NodeViewProps) => {
    const contentType = getContentMentionContentType(node.attrs.contentType);
    const isFile = contentType === FILE_CONTENT_TYPE;
    const Icon = isFile
        ? IconFile
        : contentType === ContentType.DASHBOARD
          ? IconLayoutDashboard
          : getChartIcon(
                (node.attrs.chartKind as ChartKind | null) ?? undefined,
            );
    const iconColor = isFile
        ? 'ldGray.6'
        : contentType === ContentType.DASHBOARD
          ? 'green.7'
          : 'blue.7';
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
