import { Card, Group, Text } from '@mantine/core';
import { IconLayoutDashboard } from '@tabler/icons-react';
import { FC } from 'react';
import { Link } from 'react-router-dom';
import { Subtitle } from '../../pages/CreateProject.styles';
import MantineIcon from '../common/MantineIcon';

interface ProjectUserAccessProps {
    projectUuid: string;
}

const SettingsUsageAnalytics: FC<ProjectUserAccessProps> = ({
    projectUuid,
}) => {
    return (
        <>
            <Subtitle>
                Lightdash curated dashboards that show usage and performance
                information about your project.
            </Subtitle>

            <Card
                component={Link}
                shadow="sm"
                withBorder
                sx={{ cursor: 'pointer' }}
                to={`/projects/${projectUuid}/user-activity`}
            >
                <Group>
                    <MantineIcon
                        icon={IconLayoutDashboard}
                        size="xl"
                        color="gray"
                    />
                    <Text fw={600} fz="lg">
                        User Activity
                    </Text>
                </Group>
            </Card>
        </>
    );
};

export default SettingsUsageAnalytics;
