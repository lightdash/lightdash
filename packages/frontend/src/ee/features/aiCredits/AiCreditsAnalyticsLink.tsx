import {
    ANALYTICS_AI_USAGE_DASHBOARD_SLUG,
    type AnalyticsProjectStatus,
} from '@lightdash/common';
import { Anchor, Group, Paper, Stack, Text } from '@mantine/core';
import { IconArrowRight } from '@tabler/icons-react';
import { type FC } from 'react';
import { Link } from 'react-router';
import MantineIcon from '../../../components/common/MantineIcon';
import { useAnalyticsProject } from '../../../hooks/organization/useAnalyticsProject';

type AnalyticsProject = NonNullable<AnalyticsProjectStatus['project']>;

const getDashboardPath = (project: AnalyticsProject) =>
    `/projects/${project.slug ?? project.projectUuid}/dashboards/${ANALYTICS_AI_USAGE_DASHBOARD_SLUG}/view`;

const ANALYTICS_SETTINGS_PATH = '/generalSettings/mcp/analytics';

const DETAIL =
    'token usage over past periods, by feature, user, project and agent';

const ArrowLink: FC<{ to: string; children: string }> = ({ to, children }) => (
    <Group gap={4} wrap="nowrap">
        <Anchor component={Link} to={to} fz="sm">
            {children}
        </Anchor>
        <MantineIcon icon={IconArrowRight} color="dimmed" />
    </Group>
);

const AnalyticsProjectPointer: FC<{ project: AnalyticsProject | null }> = ({
    project,
}) => {
    if (project === null) {
        return (
            <Text fz="sm" c="dimmed">
                Explore {DETAIL} in your organization&apos;s analytics project
                once it is set up.
            </Text>
        );
    }
    // A project set up before this dashboard existed only gets it when the managed content is synced.
    if (project.hasContentUpdates) {
        return (
            <ArrowLink to={ANALYTICS_SETTINGS_PATH}>
                Sync your analytics project to get the AI usage dashboard
            </ArrowLink>
        );
    }
    return (
        <ArrowLink to={getDashboardPath(project)}>
            {`Explore ${DETAIL}`}
        </ArrowLink>
    );
};

/** Points admins at the analytics project for anything beyond the current period. */
export const AiCreditsAnalyticsLink: FC = () => {
    const { data, isLoading, isError } = useAnalyticsProject();
    // The status request is refused when analytics is off for the organization, so there is nothing to point at.
    if (isLoading || isError) return null;

    return (
        <Paper p="md">
            <Stack gap={4}>
                <Text fz="sm" fw={500}>
                    Looking for more detail?
                </Text>
                <AnalyticsProjectPointer project={data?.project ?? null} />
            </Stack>
        </Paper>
    );
};
