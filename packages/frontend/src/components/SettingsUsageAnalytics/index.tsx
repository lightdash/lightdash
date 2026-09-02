import { Card, Group, Stack, Text } from '@mantine/core';
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
        <Stack gap="md">
            <Card
                component={Link}
                shadow="sm"
                className="ld-pointer"
                to={`/projects/${projectUuid}/user-activity`}
            >
                <Group>
                    <MantineIcon
                        icon={IconLayoutDashboard}
                        size="xl"
                        color="dimmed"
                    />
                    <Text fw={600} fz="lg">
                        User Activity
                    </Text>
                </Group>
            </Card>
        </Stack>
    );
};

export default SettingsUsageAnalytics;
