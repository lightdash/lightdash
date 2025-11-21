import {
    assertUnreachable,
    SchedulerFormat,
    SchedulerJobStatus,
    type SchedulerAndTargets,
    type SchedulerRun,
    type SchedulerWithLogs,
} from '@lightdash/common';
import { type MantineTheme } from '@mantine-8/core';
import {
    IconAlertTriangleFilled,
    IconCircleCheckFilled,
    IconClockFilled,
    IconCsv,
    IconFileTypeXls,
    IconPhoto,
    IconProgress,
} from '@tabler/icons-react';
import dayjs from 'dayjs';
import { GSheetsIconFilled } from '../../components/common/GSheetsIcon';
import MantineIcon from '../common/MantineIcon';
import { IconBox } from '../common/ResourceIcon';

export type SchedulerItem = SchedulerAndTargets & {
    latestRun?: SchedulerRun | null;
};
export type Log = SchedulerWithLogs['logs'][number];

// Type that works for both SchedulerLog and SchedulerRunLog
export type LogForIcon = {
    status: SchedulerJobStatus;
    details?: { error?: string; [key: string]: unknown } | null;
};

export type SchedulerColumnName =
    | 'name'
    | 'destinations'
    | 'frequency'
    | 'lastDelivery'
    | 'actions'
    | 'jobs'
    | 'deliveryScheduled'
    | 'deliveryStarted'
    | 'status';

export const getSchedulerIcon = (item: { format: SchedulerFormat }) => {
    switch (item.format) {
        case SchedulerFormat.CSV:
            return <IconBox icon={IconCsv} color="indigo.6" />;
        case SchedulerFormat.XLSX:
            return <IconBox icon={IconFileTypeXls} color="indigo.6" />;
        case SchedulerFormat.IMAGE:
            return <IconBox icon={IconPhoto} color="indigo.6" />;
        case SchedulerFormat.GSHEETS:
            return <IconBox icon={GSheetsIconFilled} color="green" />;
        default:
            return assertUnreachable(
                item.format,
                'Resource type not supported',
            );
    }
};

export const getLogStatusIconWithoutTooltip = (
    status: SchedulerJobStatus,
    theme: MantineTheme,
) => {
    switch (status) {
        case SchedulerJobStatus.SCHEDULED:
            return (
                <MantineIcon
                    icon={IconClockFilled}
                    color="blue.3"
                    style={{ color: theme.colors.blue[3] }}
                />
            );
        case SchedulerJobStatus.STARTED:
            return (
                <MantineIcon
                    icon={IconProgress}
                    color="yellow.6"
                    style={{ color: theme.colors.yellow[6] }}
                />
            );
        case SchedulerJobStatus.COMPLETED:
            return (
                <MantineIcon
                    icon={IconCircleCheckFilled}
                    color="green.6"
                    style={{ color: theme.colors.green[6] }}
                />
            );
        case SchedulerJobStatus.ERROR:
            return (
                <MantineIcon
                    icon={IconAlertTriangleFilled}
                    color="red.6"
                    style={{ color: theme.colors.red[6] }}
                />
            );
        default:
            return assertUnreachable(status, 'Resource type not supported');
    }
};

export const getSchedulerLink = (
    item: SchedulerItem | SchedulerRun,
    projectUuid: string,
) => {
    const paramName =
        'thresholds' in item && item.thresholds && item.thresholds.length > 0
            ? 'threshold_uuid'
            : 'scheduler_uuid';

    // Handle SchedulerRun (uses resourceType/resourceUuid)
    if ('resourceType' in item) {
        const resourcePath =
            item.resourceType === 'chart'
                ? `/projects/${projectUuid}/saved/${item.resourceUuid}/view`
                : `/projects/${projectUuid}/dashboards/${item.resourceUuid}/view`;

        return `${resourcePath}?${paramName}=${item.schedulerUuid}${
            item.format === SchedulerFormat.GSHEETS ? `&isSync=true` : ``
        }`;
    }

    // Handle SchedulerItem (uses savedChartUuid/dashboardUuid)
    return item.savedChartUuid
        ? `/projects/${projectUuid}/saved/${
              item.savedChartUuid
          }/view/?${paramName}=${item.schedulerUuid}${
              item.format === SchedulerFormat.GSHEETS ? `&isSync=true` : ``
          }`
        : `/projects/${projectUuid}/dashboards/${item.dashboardUuid}/view/?${paramName}=${item.schedulerUuid}`;
};
export const getItemLink = (item: SchedulerItem, projectUuid: string) => {
    return item.savedChartUuid
        ? `/projects/${projectUuid}/saved/${item.savedChartUuid}/view`
        : `/projects/${projectUuid}/dashboards/${item.dashboardUuid}/view`;
};

export const formatTime = (date: Date) =>
    dayjs(date).format('YYYY/MM/DD hh:mm A');

export const formatTaskName = (task: string): string => {
    // Convert camelCase to Title Case with spaces
    // e.g., "sendSlackNotification" → "Send Slack Notification"
    return task
        .replace(/([A-Z])/g, ' $1')
        .replace(/^./, (str) => str.toUpperCase())
        .trim();
};
