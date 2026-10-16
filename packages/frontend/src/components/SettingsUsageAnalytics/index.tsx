import { Card, Group, Stack, Text } from '@mantine/core';
import { IconLayoutDashboard } from '@tabler/icons-react';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import MantineIcon from '../common/MantineIcon';
import classes from './SettingsUsageAnalytics.module.css';

interface ProjectUserAccessProps {
    projectUuid: string;
}

const SettingsUsageAnalytics: FC<ProjectUserAccessProps> = ({
    projectUuid,
}) => {
    const { t } = useTranslation('projectSettings');
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
                        icon={IconLayoutDashboard}
                        size="xl"
                        color="dimmed"
                    />
                    <Text fw={600} fz="lg">
                        {t('usageAnalytics.userActivity')}
                    </Text>
                </Group>
            </Card>
        </Stack>
    );
};

export default SettingsUsageAnalytics;
