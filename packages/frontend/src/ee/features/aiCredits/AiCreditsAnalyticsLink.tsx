import { ANALYTICS_AI_USAGE_DASHBOARD_SLUG } from '@lightdash/common';
import { Anchor, Group, Paper, Stack, Text } from '@mantine/core';
import { IconArrowRight } from '@tabler/icons-react';
import { type FC } from 'react';
import { Link } from 'react-router';
import MantineIcon from '../../../components/common/MantineIcon';
import { useAnalyticsProject } from '../../../hooks/organization/useAnalyticsProject';

const getDashboardPath = (project: {
    projectUuid: string;
    slug: string | null;
}) =>
    `/projects/${project.slug ?? project.projectUuid}/dashboards/${ANALYTICS_AI_USAGE_DASHBOARD_SLUG}/view`;

/**
 * Points admins at the analytics project for anything beyond the current period.
 * The status request fails when the analytics feature is off for the organization,
 * which reads the same as having no project yet.
 */
export const AiCreditsAnalyticsLink: FC = () => {
    const { data, isInitialLoading } = useAnalyticsProject();
    if (isInitialLoading) return null;
    const project = data?.project ?? null;

    return (
        <Paper p="md">
            <Stack gap={4}>
                <Text fz="sm" fw={500}>
                    Looking for more detail?
                </Text>
                {project === null ? (
                    <Text fz="sm" c="dimmed">
                        Usage over past periods, by user, model and channel, is
                        available in your organization&apos;s analytics project
                        once it is set up.
                    </Text>
                ) : (
                    <Group gap={4} wrap="nowrap">
                        <Anchor
                            component={Link}
                            to={getDashboardPath(project)}
                            fz="sm"
                        >
                            Explore usage over past periods, by user, model and
                            channel
                        </Anchor>
                        <MantineIcon icon={IconArrowRight} color="dimmed" />
                    </Group>
                )}
            </Stack>
        </Paper>
    );
};
