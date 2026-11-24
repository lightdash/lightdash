import { Anchor, Group, Text } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import { type FC } from 'react';
import { Link } from 'react-router';
import MantineIcon from '../../../components/common/MantineIcon';
import { useResultsCacheStatus } from '../../../hooks/useProjectResultsCacheSettings';

const WARNING_TEXT = 'var(--mantine-color-orange-text)';

/**
 * Live data sources reuse results only while the project caches them; without
 * that every query calls the integration and runs into its rate limits. One
 * line in the flow of the form, not a banner.
 */
export const ProjectCacheOffAlert: FC<{
    projectUuid: string;
    message?: string;
    /** Leave out the inline Turn on link when the row has its own button. */
    withLink?: boolean;
}> = ({
    projectUuid,
    message = 'Caching is off for this project, so every query calls the API',
    withLink = true,
}) => {
    const { data } = useResultsCacheStatus(projectUuid);
    if (data?.enabled !== false) return null;
    return (
        <Group gap={6} wrap="nowrap" role="status">
            <MantineIcon
                icon={IconAlertTriangle}
                size={14}
                color={WARNING_TEXT}
            />
            <Text fz="xs" c={WARNING_TEXT}>
                {message}
                {withLink ? (
                    <>
                        {' '}
                        <Anchor
                            component={Link}
                            to={`/generalSettings/projectManagement/${projectUuid}/caching`}
                            fz="xs"
                            fw={500}
                        >
                            Turn on
                        </Anchor>
                    </>
                ) : null}
            </Text>
        </Group>
    );
};
