import { getHumanReadableCronExpression } from '@lightdash/common';
import { Anchor, Card, Table, Title } from '@mantine/core';
import { FC } from 'react';
import { useDashboardQuery } from '../../hooks/dashboard/useDashboard';
import { useSchedulerLogs } from '../../hooks/scheduler/useScheduler';
import { useSavedQuery } from '../../hooks/useSavedQuery';

interface ProjectUserAccessProps {
    projectUuid: string;
}

const SettingsScheduledDeliveries: FC<ProjectUserAccessProps> = ({
    projectUuid,
}) => {
    const { data } = useSchedulerLogs(projectUuid);
    const getScheduledContent = (uuid: string, type: 'chart' | 'dashboard') => {
        const { data: scheduledContentData } =
            type === 'chart'
                ? // eslint-disable-next-line react-hooks/rules-of-hooks
                  useSavedQuery({ id: uuid })
                : // eslint-disable-next-line react-hooks/rules-of-hooks
                  useDashboardQuery(uuid);
        return (
            <Anchor
                href={`/projects/${projectUuid}/${
                    type === 'chart' ? 'saved' : 'dashboards'
                }/${scheduledContentData?.uuid}/view`}
                target="_blank"
            >
                {scheduledContentData?.name}
            </Anchor>
        );
    };

    return (
        <Card withBorder shadow="xs">
            <Title order={5}>Run history</Title>
            <Table my="md" verticalSpacing="md" highlightOnHover>
                <thead>
                    <tr>
                        <th>Status</th>
                        <th>Name</th>
                        <th>Scheduled content</th>
                        <th>Delivery started</th>
                        <th>Schedule</th>
                    </tr>
                </thead>
                <tbody>
                    {data?.map((scheduler) => {
                        return (
                            <tr key={scheduler.schedulerUuid}>
                                <td>{scheduler.logs[0].status}</td>
                                <td>{scheduler.name}</td>
                                <td>
                                    {scheduler.dashboardUuid !== null
                                        ? getScheduledContent(
                                              scheduler.dashboardUuid,
                                              'dashboard',
                                          )
                                        : getScheduledContent(
                                              scheduler.savedChartUuid!,
                                              'chart',
                                          )}
                                </td>
                                <td>
                                    {new Date(
                                        scheduler.logs[0].scheduledTime,
                                    ).toLocaleString('en-US', {
                                        timeZone: 'UTC',
                                        dateStyle: 'full',
                                        timeStyle: 'medium',
                                    })}
                                </td>
                                <td>
                                    {getHumanReadableCronExpression(
                                        scheduler.cron,
                                    )}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </Table>
        </Card>
    );
};

export default SettingsScheduledDeliveries;
