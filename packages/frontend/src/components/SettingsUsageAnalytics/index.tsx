import { Button } from '@mantine/core';
import { IconLayoutDashboard } from '@tabler/icons-react';
import { type FC } from 'react';
import { Link } from 'react-router';
import { SettingRow } from '../common/Settings/SettingLayout';
import { SettingsCard } from '../common/Settings/SettingsCard';

interface ProjectUserAccessProps {
    projectUuid: string;
}

const SettingsUsageAnalytics: FC<ProjectUserAccessProps> = ({
    projectUuid,
}) => {
    return (
        <SettingsCard>
            <SettingRow
                title="User activity"
                description="Active users, queries, and chart and dashboard views for this project."
                icon={IconLayoutDashboard}
                control={
                    <Button
                        component={Link}
                        to={`/projects/${projectUuid}/user-activity`}
                        variant="default"
                        size="xs"
                    >
                        Open dashboard
                    </Button>
                }
            />
        </SettingsCard>
    );
};

export default SettingsUsageAnalytics;
