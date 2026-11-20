import { Card, Group, Stack, Text } from '@mantine/core';
import { type FC } from 'react';
import { Link } from 'react-router';
import { DashboardIcon } from '../common/ContentIcons';
import MantineIcon from '../common/MantineIcon';
import classes from './SettingsUsageAnalytics.module.css';

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
                className={classes.linkCard}
                to={`/projects/${projectUuid}/user-activity`}
            >
                <Group>
                    <MantineIcon
                        icon={DashboardIcon}
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
