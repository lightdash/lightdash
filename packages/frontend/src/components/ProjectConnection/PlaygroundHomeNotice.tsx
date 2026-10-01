import { subject } from '@casl/ability';
import { FeatureFlags, ProjectType } from '@lightdash/common';
import { Button, Stack, Text } from '@mantine/core';
import { type FC } from 'react';
import { Link } from 'react-router';
import { useProject } from '../../hooks/useProject';
import { useServerFeatureFlag } from '../../hooks/useServerOrClientFeatureFlag';
import useApp from '../../providers/App/useApp';
import { isPlaygroundProvisioningSource } from '../../utils/playgroundProject';
import Callout from '../common/Callout';

export const PlaygroundHomeNotice: FC<{ projectUuid: string }> = ({
    projectUuid,
}) => {
    const { user } = useApp();
    const { data: project } = useProject(projectUuid);
    const connectJourneyFlag = useServerFeatureFlag(
        FeatureFlags.ConnectJourney,
    );
    if (
        connectJourneyFlag.data?.enabled !== true ||
        !project ||
        !isPlaygroundProvisioningSource(project.provisioningSource)
    ) {
        return null;
    }
    const canCreateProject = user.data?.ability?.can(
        'create',
        subject('Project', {
            organizationUuid: project.organizationUuid,
            type: ProjectType.DEFAULT,
        }),
    );

    return (
        <Callout variant="info" title="This project uses sample data">
            <Stack gap="sm" align="flex-start">
                <Text size="sm">
                    Open a dashboard or run a query to see how Lightdash works.
                    {canCreateProject
                        ? ' Connect a warehouse when you are ready to use your own data.'
                        : ' Ask an admin to connect your own data.'}
                </Text>
                {canCreateProject && (
                    <Button
                        component={Link}
                        to="/onboarding/data-source"
                        size="xs"
                    >
                        Connect a warehouse
                    </Button>
                )}
            </Stack>
        </Callout>
    );
};
