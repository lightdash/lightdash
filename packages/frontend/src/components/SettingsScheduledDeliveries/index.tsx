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
                                    {scheduler.dashboardUuid !== null ? (
                                        <Anchor
                                            href={`/projects/${projectUuid}/dashboards/${scheduler?.dashboardUuid}/view`}
                                            target="_blank"
                                        >
                                            Scheduled dashboard
                                        </Anchor>
                                    ) : (
                                        <Anchor
                                            href={`/projects/${projectUuid}/saved/${scheduler?.savedChartUuid}/view`}
                                            target="_blank"
                                        >
                                            Scheduled chart
                                        </Anchor>
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
