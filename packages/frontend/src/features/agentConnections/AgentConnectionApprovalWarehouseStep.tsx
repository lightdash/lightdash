import {
    AiAccessRefusalAction,
    AiAccessRefusalReason,
    UserWarehouseCredentialPurpose,
    WarehouseTypes,
    type AgentConnectionApprovalProject,
    type AiAccessForUser,
} from '@lightdash/common';
import { Button, Loader, Paper, Stack, Text } from '@mantine/core';
import { Link } from 'react-router';
import EmptyStateLoader from '../../components/common/EmptyStateLoader';
import InlineErrorState from '../../components/common/InlineErrorState';
import { AiServiceAccountConnectionCard } from '../../components/UserSettings/MyAgentConnectionsPanel/AiServiceAccountConnectionCard';
import { SnowflakeAgentConnectionCard } from '../../components/UserSettings/MyAgentConnectionsPanel/SnowflakeAgentConnectionCard';
import { useProjects } from '../../hooks/useProjects';
import { useUserWarehouseCredentials } from '../../hooks/userWarehouseCredentials/useUserWarehouseCredentials';
import { isSingleConnectionProject } from '../../hooks/useWarehouseConnections';
import { warehouseStepCopy, warehouseStepMessage } from './approvalSelection';
import { useApprovalWarehouses } from './approvalWarehouseApi';

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
    name,
    warehouseType,
    access,
}: {
    projectUuid: string;
    name: string | null;
    warehouseType: WarehouseTypes | undefined;
    access: ReturnType<
        typeof useApprovalWarehouses
    >['projects'][number]['bindings'][number]['access'];
}) => {
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
    connections,
    bindings,
}: ReturnType<typeof useApprovalWarehouses>['projects'][number] & {
    warehouseType: WarehouseTypes | undefined;
}) => {
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
                ) : bindings.length ? (
                    bindings.map((binding) => (
                        <WarehouseReadiness
                            key={binding.connectionUuid ?? 'original'}
                            access={binding.access}
                            projectUuid={project.projectUuid}
                            name={binding.name}
                            warehouseType={
                                binding.warehouseType ?? warehouseType
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
    notice = null,
}: {
    projects: AgentConnectionApprovalProject[];
    notice?: string | null;
}) => {
    const visibleProjects = useProjects();
    const warehouses = useApprovalWarehouses(projects, !!visibleProjects.data);
    if (visibleProjects.isError)
        return (
            <Stack>
                <InlineErrorState
                    message={visibleProjects.error.error.message}
                    onRetry={() => void visibleProjects.refetch()}
                />
                <Button
                    component={Link}
                    to={warehouseStepCopy.deferTo}
                    variant="default"
                >
                    {warehouseStepCopy.defer}
                </Button>
            </Stack>
        );
    if (!visibleProjects.data)
        return <EmptyStateLoader title={warehouseStepCopy.loading} />;
    return (
        <Stack>
            {warehouses.needsAttention && (
                <Text>{warehouseStepMessage(notice)}</Text>
            )}
            {warehouses.projects.map(({ project, connections, bindings }) => (
                <ProjectWarehouses
                    connections={connections}
                    bindings={bindings}
                    key={project.projectUuid}
                    project={project}
                    warehouseType={
                        visibleProjects.data.find(
                            (item) => item.projectUuid === project.projectUuid,
                        )?.warehouseType
                    }
                />
            ))}
            {warehouses.needsAttention && (
                <Button
                    component={Link}
                    to={warehouseStepCopy.deferTo}
                    variant="default"
                >
                    {warehouseStepCopy.defer}
                </Button>
            )}
        </Stack>
    );
};
