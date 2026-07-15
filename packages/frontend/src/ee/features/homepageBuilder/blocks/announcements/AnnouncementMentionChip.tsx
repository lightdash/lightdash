import { ContentType, type ChartKind } from '@lightdash/common';
import { IconLayoutDashboard } from '@tabler/icons-react';
import { type FC } from 'react';
import { Link } from 'react-router';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { getChartIcon } from '../../../../../components/common/ResourceIcon/utils';
import TruncatedText from '../../../../../components/common/TruncatedText';
import styles from '../../../aiCopilot/components/ChatElements/AgentChatInput.module.css';
import chipClasses from './AnnouncementMentionChip.module.css';

type Props = {
    projectUuid: string;
    contentType: ContentType.CHART | ContentType.DASHBOARD;
    uuid: string;
    label: string;
    chartKind?: ChartKind | null;
};

export const AnnouncementMentionChip: FC<Props> = ({
    projectUuid,
    contentType,
    uuid,
    label,
    chartKind,
}) => {
    const isDashboard = contentType === ContentType.DASHBOARD;
    const Icon = isDashboard
        ? IconLayoutDashboard
        : getChartIcon(chartKind ?? undefined);
    const url = isDashboard
        ? `/projects/${projectUuid}/dashboards/${uuid}/view`
        : `/projects/${projectUuid}/saved/${uuid}/view`;

    return (
        <Link
            to={url}
            className={`${styles.contentMention} ${chipClasses.chip}`}
            data-content-type={contentType}
            data-content-link="true"
        >
            <span
                className={styles.contentMentionIcon}
                data-rendered-icon="true"
            >
                <MantineIcon
                    icon={Icon}
                    size={12}
                    color={isDashboard ? 'green.7' : 'blue.7'}
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
        </Link>
    );
};
