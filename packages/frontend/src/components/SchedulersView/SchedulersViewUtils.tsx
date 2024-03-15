import {
    assertUnreachable,
    SchedulerFormat,
    SchedulerJobStatus,
    type SchedulerWithLogs,
} from '@lightdash/common';
import { Tooltip, type MantineTheme } from '@mantine/core';
import {
    IconAlertTriangleFilled,
    IconCircleCheckFilled,
    IconClockFilled,
    IconCsv,
    IconPhoto,
    IconProgress,
} from '@tabler/icons-react';
import dayjs from 'dayjs';
import { GSheetsIconFilled } from '../../components/common/GSheetsIcon';
import MantineIcon from '../common/MantineIcon';
import { IconBox } from '../common/ResourceIcon';

export type SchedulerItem = SchedulerWithLogs['schedulers'][number];
export type Log = SchedulerWithLogs['logs'][number];

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

export const getSchedulerIcon = (item: SchedulerItem, theme: MantineTheme) => {
    switch (item.format) {
        case SchedulerFormat.CSV:
            return (
                <IconBox
                    icon={IconCsv}
                    color="indigo.6"
                    style={{ color: theme.colors.indigo[6] }}
                />
            );
        case SchedulerFormat.IMAGE:
            return (
                <IconBox
                    icon={IconPhoto}
                    color="indigo.6"
                    style={{ color: theme.colors.indigo[6] }}
                />
            );
        case SchedulerFormat.GSHEETS:
            return <IconBox icon={GSheetsIconFilled} color="green" />;
        default:
            return assertUnreachable(
                item.format,
                'Resource type not supported',
            );
    }
};

export const getLogStatusIcon = (log: Log, theme: MantineTheme) => {
    switch (log.status) {
        case SchedulerJobStatus.SCHEDULED:
            return (
                <Tooltip label={SchedulerJobStatus.SCHEDULED}>
                    <MantineIcon
                        icon={IconClockFilled}
                        color="blue.3"
                        style={{ color: theme.colors.blue[3] }}
                    />
                </Tooltip>
            );
        case SchedulerJobStatus.STARTED:
            return (
                <Tooltip label={SchedulerJobStatus.STARTED}>
                    <MantineIcon
                        icon={IconProgress}
                        color="yellow.6"
                        style={{ color: theme.colors.yellow[6] }}
                    />
                </Tooltip>
            );
        case SchedulerJobStatus.COMPLETED:
            return (
                <Tooltip label={SchedulerJobStatus.COMPLETED}>
                    <MantineIcon
                        icon={IconCircleCheckFilled}
                        color="green.6"
                        style={{ color: theme.colors.green[6] }}
                    />
                </Tooltip>
            );
        case SchedulerJobStatus.ERROR:
            return (
                <Tooltip label={log?.details?.error} multiline>
                    <MantineIcon
                        icon={IconAlertTriangleFilled}
                        color="red.6"
                        style={{ color: theme.colors.red[6] }}
                    />
                </Tooltip>
            );
        default:
            return assertUnreachable(log.status, 'Resource type not supported');
    }
};

export const getSchedulerLink = (item: SchedulerItem, projectUuid: string) => {
    return item.savedChartUuid
        ? `/projects/${projectUuid}/saved/${
              item.savedChartUuid
          }/view/?scheduler_uuid=${item.schedulerUuid}${
              item.format === SchedulerFormat.GSHEETS ? `&isSync=true` : ``
          }`
        : `/projects/${projectUuid}/dashboards/${item.dashboardUuid}/view/?scheduler_uuid=${item.schedulerUuid}`;
};
export const getItemLink = (item: SchedulerItem, projectUuid: string) => {
    return item.savedChartUuid
        ? `/projects/${projectUuid}/saved/${item.savedChartUuid}/view`
        : `/projects/${projectUuid}/dashboards/${item.dashboardUuid}/view`;
};

export const formatTime = (date: Date) =>
    dayjs(date).format('YYYY/MM/DD hh:mm A');
