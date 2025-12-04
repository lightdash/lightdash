import { FeatureFlags } from '@lightdash/common';
import { Card, Group, Stack, Text } from '@mantine/core';
import { IconArchive, IconLayoutDashboard } from '@tabler/icons-react';
import { type FC } from 'react';
import { Link } from 'react-router';
import { useFeatureFlagEnabled } from '../../hooks/useFeatureFlagEnabled';
import MantineIcon from '../common/MantineIcon';

interface ProjectUserAccessProps {
    projectUuid: string;
}

const SettingsUsageAnalytics: FC<ProjectUserAccessProps> = ({
    projectUuid,
}) => {
    const isUnusedContentDashboardEnabled = useFeatureFlagEnabled(
        FeatureFlags.UnusedContentDashboard,
    );

    return (
        <>
            <Text color="dimmed">
                Lightdash curated dashboards that show usage and performance
                information about your project.
            </Text>

            <Stack spacing="md">
                <Card
                    component={Link}
                    shadow="sm"
                    withBorder
                    style={{ cursor: 'pointer' }}
                    to={`/projects/${projectUuid}/user-activity`}
                >
                    <Group>
                        <MantineIcon
                            icon={IconLayoutDashboard}
                            size="xl"
                            color="ldGray.6"
                        />
                        <Text fw={600} fz="lg">
                            User Activity
                        </Text>
                    </Group>
                </Card>

                {isUnusedContentDashboardEnabled && (
                    <Card
                        component={Link}
                        shadow="sm"
                        withBorder
                        style={{ cursor: 'pointer' }}
                        to={`/projects/${projectUuid}/unused-content`}
                    >
                        <Group>
                            <MantineIcon
                                icon={IconArchive}
                                size="xl"
                                color="ldGray.6"
                            />
                            <Text fw={600} fz="lg">
                                Least viewed content
                            </Text>
                        </Group>
                    </Card>
                )}
            </Stack>
        </>
    );
};

export default SettingsUsageAnalytics;
