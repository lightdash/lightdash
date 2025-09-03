import { Box, Stack, Text, Title } from '@mantine-8/core';
import { IconLock } from '@tabler/icons-react';
import SuboptimalState from '../../../../../components/common/SuboptimalState/SuboptimalState';
import useApp from '../../../../../providers/App/useApp';
import AiAgentAdminThreadsTable from './AiAgentAdminThreadsTable';

export const AiAgentsAdminLayout = () => {
    const { user } = useApp();
    const canManageOrganization = user.data?.ability.can(
        'manage',
        'Organization',
    );
    if (!canManageOrganization) {
        return (
            <Box mt="30vh">
                <SuboptimalState
                    title={`You don't have access to this page`}
                    description={
                        <>
                            You must be an organization admin to access this
                            page.
                        </>
                    }
                    icon={IconLock}
                />
            </Box>
        );
    }
    return (
        <Stack>
            <Box>
                <Title order={2}>AI Agents Admin Panel</Title>
                <Text c="gray.6" size="sm" fw={400}>
                    View and manage AI Agents threads
                </Text>
            </Box>

            <AiAgentAdminThreadsTable />
        </Stack>
    );
};
