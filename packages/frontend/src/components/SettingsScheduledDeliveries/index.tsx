import { getHumanReadableCronExpression } from '@lightdash/common';
import { Anchor, Badge, Card, Table, Title, Tooltip } from '@mantine/core';
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
    const renderStatusBadge = (
        status: string,
        details?: Record<string, any | undefined>,
    ) => {
        switch (status) {
            case 'scheduled': {
                return <Badge color="gray">Scheduled</Badge>;
            }
            case 'started': {
                return <Badge>Started</Badge>;
            }
            case 'completed': {
                return <Badge color="green">Completed</Badge>;
            }
            case 'error': {
                return (
                    <Tooltip label={details?.error || ''}>
                        <Badge color="red">Error</Badge>
                    </Tooltip>
                );
            }
        }
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
                                <td>
                                    {renderStatusBadge(
                                        scheduler.logs[0].status,
                                        scheduler.logs[0].details || undefined,
                                    )}
                                </td>
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
