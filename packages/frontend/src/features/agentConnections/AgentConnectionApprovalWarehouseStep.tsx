import {
    AiAccessRefusalAction,
    AiAccessRefusalReason,
    UserWarehouseCredentialPurpose,
    WarehouseTypes,
    type AgentConnectionApprovalProject,
    type AiAccessForUser,
} from '@lightdash/common';
import { Loader, Paper, Stack, Text } from '@mantine/core';
import { useState } from 'react';
import EmptyStateLoader from '../../components/common/EmptyStateLoader';
import InlineErrorState from '../../components/common/InlineErrorState';
import { AiServiceAccountConnectionCard } from '../../components/UserSettings/MyAgentConnectionsPanel/AiServiceAccountConnectionCard';
import { SnowflakeAgentConnectionCard } from '../../components/UserSettings/MyAgentConnectionsPanel/SnowflakeAgentConnectionCard';
import { useProjects } from '../../hooks/useProjects';
import { useUserWarehouseCredentials } from '../../hooks/userWarehouseCredentials/useUserWarehouseCredentials';
import { isSingleConnectionProject } from '../../hooks/useWarehouseConnections';
import { warehouseStepCopy } from './approvalSelection';
import {
    useApprovalWarehouseConnections,
    useApprovalWarehouseReadiness,
} from './approvalWarehouseApi';
import { createRequestQueue, type RequestQueue } from './requestQueue';

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
        return <EmptyStateLoader title={warehouseStepCopy.loadingSignIn} />;
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
            signInLabel={warehouseStepCopy.signIn}
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
    queue,
}: {
    projectUuid: string;
    connectionUuid: string | null;
    name: string | null;
    warehouseType: WarehouseTypes | undefined;
    queue: RequestQueue;
}) => {
    const access = useApprovalWarehouseReadiness(
        projectUuid,
        connectionUuid,
        queue,
    );
    if (access.isError)
        return (
            <InlineErrorState
                message={access.error?.error.message ?? warehouseStepCopy.error}
                onRetry={() => void access.refetch()}
            />
        );
    if (!access.data)
        return <Loader size="xs" aria-label={warehouseStepCopy.checking} />;
    if (!access.data.enabled)
        return <Text size="sm">{warehouseStepCopy.administrator}</Text>;
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
                        <Text size="sm">{warehouseStepCopy.administrator}</Text>
                    )}
                </>
            ) : (
                <>
                    <Text size="sm" c="green">
                        {warehouseStepCopy.ready}
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
    queue,
}: {
    project: AgentConnectionApprovalProject;
    warehouseType: WarehouseTypes | undefined;
    queue: RequestQueue;
}) => {
    const connections = useApprovalWarehouseConnections(
        project.projectUuid,
        queue,
    );
    const singleConnection = isSingleConnectionProject(connections.error);
    return (
        <Paper p="md">
            <Stack gap="sm">
                <Text fw={500}>{project.name}</Text>
                {connections.isInitialLoading ? (
                    <Loader size="xs" aria-label={warehouseStepCopy.loading} />
                ) : connections.isError && !singleConnection ? (
                    <>
                        <Text size="sm">{warehouseStepCopy.administrator}</Text>
                        <InlineErrorState
                            message={connections.error.error.message}
                            onRetry={() => void connections.refetch()}
                        />
                    </>
                ) : singleConnection ? (
                    <WarehouseReadiness
                        queue={queue}
                        projectUuid={project.projectUuid}
                        connectionUuid={null}
                        name={null}
                        warehouseType={warehouseType}
                    />
                ) : connections.data?.length ? (
                    connections.data.map((connection) => (
                        <WarehouseReadiness
                            queue={queue}
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
                    <Text size="sm">{warehouseStepCopy.administrator}</Text>
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
    const [queue] = useState(createRequestQueue);
    const visibleProjects = useProjects();
    if (visibleProjects.isError)
        return (
            <InlineErrorState
                message={visibleProjects.error.error.message}
                onRetry={() => void visibleProjects.refetch()}
            />
        );
    if (!visibleProjects.data)
        return <EmptyStateLoader title={warehouseStepCopy.loading} />;
    return (
        <Stack>
            {projects.map((project) => (
                <ProjectWarehouses
                    queue={queue}
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
