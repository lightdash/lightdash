import { Alert, Anchor, Text } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import { type FC } from 'react';
import { Link } from 'react-router';
import MantineIcon from '../../../components/common/MantineIcon';
import { useResultsCacheStatus } from '../../../hooks/useProjectResultsCacheSettings';

/**
 * Live data sources reuse results only while the project caches them; without
 * that every query calls the integration and runs into its rate limits.
 */
export const ProjectCacheOffAlert: FC<{ projectUuid: string }> = ({
    projectUuid,
}) => {
    const { data } = useResultsCacheStatus(projectUuid);
    if (data?.enabled !== false) return null;
    return (
        <Alert
            color="yellow"
            icon={<MantineIcon icon={IconAlertTriangle} />}
            title="Results caching is off for this project"
        >
            <Text fz="sm">
                Every query on a live data source calls its integration, so rate
                limits are reached quickly.{' '}
                <Anchor
                    component={Link}
                    to={`/generalSettings/projectManagement/${projectUuid}/caching`}
                    fz="sm"
                >
                    Turn on results caching
                </Anchor>
            </Text>
        </Alert>
    );
};
