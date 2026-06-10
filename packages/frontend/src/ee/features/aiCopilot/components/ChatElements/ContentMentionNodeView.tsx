import { ContentType, type ChartKind } from '@lightdash/common';
import { IconLayoutDashboard } from '@tabler/icons-react';
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { getChartIcon } from '../../../../../components/common/ResourceIcon/utils';
import TruncatedText from '../../../../../components/common/TruncatedText';
import styles from './AgentChatInput.module.css';

const getContentMentionContentType = (value: unknown) =>
    value === ContentType.DASHBOARD ? ContentType.DASHBOARD : ContentType.CHART;

export const ContentMentionNodeView = ({ node }: NodeViewProps) => {
    const contentType = getContentMentionContentType(node.attrs.contentType);
    const Icon =
        contentType === ContentType.DASHBOARD
            ? IconLayoutDashboard
            : getChartIcon(
                  (node.attrs.chartKind as ChartKind | null) ?? undefined,
              );
    const iconColor =
        contentType === ContentType.DASHBOARD ? 'green.7' : 'blue.7';
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
