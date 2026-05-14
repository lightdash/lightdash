import { Card, Group, Stack, Text } from '@mantine-8/core';
import { IconLayoutDashboard } from '@tabler/icons-react';
import { type FC } from 'react';
import { Link } from 'react-router';
import MantineIcon from '../common/MantineIcon';

interface ProjectUserAccessProps {
    projectUuid: string;
}

const SettingsUsageAnalytics: FC<ProjectUserAccessProps> = ({
    projectUuid,
}) => {
    return (
        <>
            <Text c="dimmed">
                Lightdash curated dashboards that show usage and performance
                information about your project.
            </Text>

            <Stack gap="md">
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
            </Stack>
        </>
    );
};

export default SettingsUsageAnalytics;
