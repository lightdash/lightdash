import { subject } from '@casl/ability';
import { Button, Stack, Text } from '@mantine/core';
import { type FC } from 'react';
import { Link } from 'react-router';
import { useProject } from '../../../hooks/useProject';
import { useWarehouseCredentialSummary } from '../../../hooks/useWarehouseCredentialSummary';
import useApp from '../../../providers/App/useApp';
import Callout from '../../common/Callout';
import { getSchedulePrompt } from './sharedSignInCopy';

export const ScheduleSignInPrompt: FC<{ projectUuid: string }> = ({
    projectUuid,
}) => {
    const { user } = useApp();
    const { data: project } = useProject(projectUuid);
    const summary = useWarehouseCredentialSummary(projectUuid);
    if (!summary.data || summary.data.hasServiceAccount) {
        return null;
    }
    const canManageConnection = user.data?.ability?.can(
        'update',
        subject('Project', {
            organizationUuid: project?.organizationUuid,
            projectUuid,
        }),
    );

    return (
        <Callout variant="warning">
            <Stack gap="xs" align="flex-start">
                <Text size="sm">
                    {getSchedulePrompt(
                        summary.data.sharedSignIn,
                        user.data?.userUuid,
                    )}
                </Text>
                {canManageConnection ? (
                    <Button
                        size="xs"
                        variant="default"
                        component={Link}
                        to={`/generalSettings/projectManagement/${projectUuid}/settings`}
                    >
                        Add a service account
                    </Button>
                ) : (
                    <Text size="sm" c="dimmed">
                        Ask an admin to add a service account.
                    </Text>
                )}
            </Stack>
        </Callout>
    );
};
