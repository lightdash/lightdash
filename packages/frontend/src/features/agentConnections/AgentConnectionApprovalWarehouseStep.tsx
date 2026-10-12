import {
    AiAccessRefusalAction,
    AiAccessRefusalReason,
    UserWarehouseCredentialPurpose,
    WarehouseTypes,
    type AgentConnectionApprovalProject,
    type AiAccessForUser,
} from '@lightdash/common';
import { Paper, Stack, Text } from '@mantine/core';
import EmptyStateLoader from '../../components/common/EmptyStateLoader';
import InlineErrorState from '../../components/common/InlineErrorState';
import { AiServiceAccountConnectionCard } from '../../components/UserSettings/MyAgentConnectionsPanel/AiServiceAccountConnectionCard';
import { SnowflakeAgentConnectionCard } from '../../components/UserSettings/MyAgentConnectionsPanel/SnowflakeAgentConnectionCard';
import { useProjects } from '../../hooks/useProjects';
import { useUserWarehouseCredentials } from '../../hooks/userWarehouseCredentials/useUserWarehouseCredentials';
import {
    isSingleConnectionProject,
    useWarehouseConnectionsForUserCredentials,
} from '../../hooks/useWarehouseConnections';
import { useMyAiAccess } from '../aiAccess/api';

const SnowflakeSignIn = ({
    access,
    projectUuid,
}: {
    access: AiAccessForUser;
    projectUuid: string;
}) => {
    const credentials = useUserWarehouseCredentials();
    if (credentials.isError)
        return (
            <InlineErrorState
                message={credentials.error.error.message}
                onRetry={() => void credentials.refetch()}
            />
        );
    if (!credentials.data)
        return <EmptyStateLoader title="Loading warehouse sign-in" />;
    const credential =
        credentials.data.find(
            (item) =>
                item.purpose === UserWarehouseCredentialPurpose.AI &&
                item.credentials.type === WarehouseTypes.SNOWFLAKE,
        ) ?? null;
    return (
        <SnowflakeAgentConnectionCard
            credential={credential}
            snowflakeConfigured
            projectUuid={projectUuid}
            signInLabel="Sign in"
            statusOverride={
                access.refusal?.reason === AiAccessRefusalReason.SIGN_IN_EXPIRED
                    ? 'expired'
                    : 'not_connected'
            }
            allowDisconnect={false}
        />
    );
};

const WarehouseReadiness = ({
    projectUuid,
    connectionUuid,
    name,
    warehouseType,
}: {
    projectUuid: string;
    connectionUuid: string | null;
    name: string | null;
    warehouseType: WarehouseTypes | undefined;
}) => {
    const access = useMyAiAccess(projectUuid, connectionUuid);
    if (access.isError)
        return (
            <InlineErrorState
                message={
                    access.error?.error.message ??
                    'Could not load warehouse sign-in.'
                }
                onRetry={() => void access.refetch()}
            />
        );
    if (!access.data)
        return <EmptyStateLoader title="Checking warehouse sign-in" />;
    if (!access.data.enabled)
        return (
            <Text size="sm">Ask an administrator to set up agent sign-in</Text>
        );
    const refusal = access.data.refusal;
    const canSignIn =
        warehouseType === WarehouseTypes.SNOWFLAKE &&
        access.data.source === 'agent_sign_in' &&
        refusal?.action === AiAccessRefusalAction.SIGN_IN;
    return (
        <Stack gap="sm">
            {name && <Text fw={500}>{name}</Text>}
            {refusal ? (
                <>
                    <Text size="sm" c="dimmed">
                        {refusal.message}
                    </Text>
                    {canSignIn ? (
                        <SnowflakeSignIn
                            access={access.data}
                            projectUuid={projectUuid}
                        />
                    ) : (
                        <Text size="sm">
                            Ask an administrator to set up agent sign-in
                        </Text>
                    )}
                </>
            ) : (
                <>
                    <Text size="sm" c="green">
                        Ready
                    </Text>
                    {access.data.source === 'ai_service_account' &&
                        warehouseType && (
                            <AiServiceAccountConnectionCard
                                warehouseType={warehouseType}
                            />
                        )}
                </>
            )}
        </Stack>
    );
};

const ProjectWarehouses = ({
    project,
    warehouseType,
}: {
    project: AgentConnectionApprovalProject;
    warehouseType: WarehouseTypes | undefined;
}) => {
    const connections = useWarehouseConnectionsForUserCredentials(
        project.projectUuid,
    );
    const singleConnection = isSingleConnectionProject(connections.error);
    return (
        <Paper p="md">
            <Stack gap="sm">
                <Text fw={500}>{project.name}</Text>
                {connections.isInitialLoading ? (
                    <EmptyStateLoader title="Loading warehouse sign-ins" />
                ) : connections.isError && !singleConnection ? (
                    <>
                        <Text size="sm">
                            Ask an administrator to set up agent sign-in
                        </Text>
                        <InlineErrorState
                            message={connections.error.error.message}
                            onRetry={() => void connections.refetch()}
                        />
                    </>
                ) : singleConnection ? (
                    <WarehouseReadiness
                        projectUuid={project.projectUuid}
                        connectionUuid={null}
                        name={null}
                        warehouseType={warehouseType}
                    />
                ) : connections.data?.length ? (
                    connections.data.map((connection) => (
                        <WarehouseReadiness
                            key={connection.warehouseConnectionUuid}
                            projectUuid={project.projectUuid}
                            connectionUuid={
                                connection.isOriginal
                                    ? null
                                    : connection.warehouseConnectionUuid
                            }
                            name={connection.name}
                            warehouseType={
                                connection.warehouseType ?? warehouseType
                            }
                        />
                    ))
                ) : (
                    <Text size="sm">
                        Ask an administrator to set up agent sign-in
                    </Text>
                )}
            </Stack>
        </Paper>
    );
};

export const AgentConnectionApprovalWarehouseStep = ({
    projects,
}: {
    projects: AgentConnectionApprovalProject[];
}) => {
    const visibleProjects = useProjects();
    if (visibleProjects.isError)
        return (
            <InlineErrorState
                message={visibleProjects.error.error.message}
                onRetry={() => void visibleProjects.refetch()}
            />
        );
    if (!visibleProjects.data)
        return <EmptyStateLoader title="Loading warehouse sign-ins" />;
    return (
        <Stack>
            {projects.map((project) => (
                <ProjectWarehouses
                    key={project.projectUuid}
                    project={project}
                    warehouseType={
                        visibleProjects.data.find(
                            (item) => item.projectUuid === project.projectUuid,
                        )?.warehouseType
                    }
                />
            ))}
        </Stack>
    );
};
