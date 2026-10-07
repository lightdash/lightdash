import { subject } from '@casl/ability';
import {
    AiTransportKind,
    AiPrincipalKind,
    FeatureFlags,
    WarehouseTypes,
} from '@lightdash/common';
import {
    Paper,
    Pagination,
    Select,
    Stack,
    Table,
    Text,
    Title,
} from '@mantine/core';
import { useState, type ReactNode } from 'react';
import { useParams } from 'react-router';
import EmptyStateLoader from '../../components/common/EmptyStateLoader';
import InlineErrorState from '../../components/common/InlineErrorState';
import { SettingsCard } from '../../components/common/Settings/SettingsCard';
import {
    SettingsPage,
    SettingsPageContainer,
} from '../../components/common/Settings/SettingsPage';
import SuboptimalState from '../../components/common/SuboptimalState/SuboptimalState';
import { useProject } from '../../hooks/useProject';
import { useServerFeatureFlag } from '../../hooks/useServerOrClientFeatureFlag';
import { useWarehouseConnections } from '../../hooks/useWarehouseConnections';
import useApp from '../../providers/App/useApp';
import { AiIdentitySettings } from './AiIdentitySettings';
import {
    useAiAccessAudit,
    useAiAccessCapabilities,
    useAiAccessPolicy,
} from './api';
const Audit = ({ projectUuid }: { projectUuid: string }) => {
    const [page, setPage] = useState(1);
    const query = useAiAccessAudit(projectUuid, null, page);
    return (
        <Stack>
            <Title order={5}>Audit</Title>
            <Text fz="xs" c="dimmed">
                Queries across all project connections.
            </Text>
            {query.isLoading ? (
                <EmptyStateLoader />
            ) : query.isError ? (
                <InlineErrorState
                    message="Could not load the audit."
                    onRetry={() => void query.refetch()}
                />
            ) : !query.data?.data.length ? (
                <Paper variant="dotted" p="md">
                    <Text c="dimmed" size="sm">
                        No agent queries yet.
                    </Text>
                </Paper>
            ) : (
                <Table.ScrollContainer minWidth={650}>
                    <Table>
                        <Table.Thead>
                            <Table.Tr>
                                {[
                                    'Time',
                                    'Person',
                                    'Ran as',
                                    'Transport',
                                    'Checked',
                                ].map((label) => (
                                    <Table.Th key={label}>{label}</Table.Th>
                                ))}
                            </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                            {query.data.data.map((row) => (
                                <Table.Tr key={row.queryUuid}>
                                    <Table.Td>
                                        {new Date(
                                            row.createdAt,
                                        ).toLocaleString()}
                                    </Table.Td>
                                    <Table.Td>
                                        {row.personEmail ??
                                            row.userUuid ??
                                            'Unknown'}
                                    </Table.Td>
                                    <Table.Td>
                                        {row.principalKind ===
                                            AiPrincipalKind.PERSON &&
                                        row.aiPrincipalUuid === null
                                            ? 'Person, marked'
                                            : row.principalRef}
                                    </Table.Td>
                                    <Table.Td>
                                        {row.transport.kind ===
                                        AiTransportKind.DIRECT
                                            ? 'Direct'
                                            : 'Procedure'}
                                    </Table.Td>
                                    <Table.Td>
                                        {row.probeOk ? 'Yes' : 'No'}
                                    </Table.Td>
                                </Table.Tr>
                            ))}
                        </Table.Tbody>
                    </Table>
                </Table.ScrollContainer>
            )}
            {(query.data?.pagination.totalPageCount ?? 0) > 1 && (
                <Pagination
                    total={Math.max(
                        1,
                        query.data?.pagination.totalPageCount ?? 1,
                    )}
                    value={page}
                    onChange={setPage}
                />
            )}
        </Stack>
    );
};
const ConnectionAccess = ({
    projectUuid,
    connection,
    connectionSelector,
}: {
    projectUuid: string;
    connection: string | null;
    connectionSelector: ReactNode;
}) => {
    const policy = useAiAccessPolicy(projectUuid, connection);
    const capabilities = useAiAccessCapabilities(projectUuid, connection);
    if (policy.isLoading || capabilities.isLoading) return <EmptyStateLoader />;
    if (policy.isError || capabilities.isError)
        return (
            <InlineErrorState
                message="Could not load agent identity settings."
                onRetry={() => {
                    void policy.refetch();
                    void capabilities.refetch();
                }}
            />
        );
    return (
        <AiIdentitySettings
            connectionSelector={connectionSelector}
            key={policy.data?.updatedAt.toString() ?? 'new'}
            projectUuid={projectUuid}
            connection={connection}
            policy={policy.data}
            capabilities={capabilities.data}
        />
    );
};
const ProjectAccess = ({ projectUuid }: { projectUuid: string }) => {
    const connections = useWarehouseConnections(projectUuid);
    const [connection, setConnection] = useState<string | null>(null);
    const snowflakeConnections =
        connections.data?.connections.filter(
            (item) => item.warehouseType === WarehouseTypes.SNOWFLAKE,
        ) ?? [];
    const selectedConnection = snowflakeConnections.some(
        (item) => item.warehouseConnectionUuid === connection,
    )
        ? connection
        : null;
    return (
        <SettingsPage
            title="Agent identity"
            description="Every query an agent runs is marked, so your warehouse can treat it differently."
        >
            <SettingsPageContainer>
                <Stack gap="xl">
                    <ConnectionAccess
                        connectionSelector={
                            snowflakeConnections.length > 1 && (
                                <Select
                                    label="Warehouse connection"
                                    value={selectedConnection ?? 'original'}
                                    data={snowflakeConnections.map((item) => ({
                                        value: item.isOriginal
                                            ? 'original'
                                            : item.warehouseConnectionUuid,
                                        label: item.name,
                                    }))}
                                    onChange={(value) =>
                                        setConnection(
                                            value === 'original' ? null : value,
                                        )
                                    }
                                />
                            )
                        }
                        key={selectedConnection ?? 'original'}
                        projectUuid={projectUuid}
                        connection={selectedConnection}
                    />
                    <SettingsCard>
                        <Audit projectUuid={projectUuid} />
                    </SettingsCard>
                </Stack>
            </SettingsPageContainer>
        </SettingsPage>
    );
};
export const AiAccessPage = () => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const { user } = useApp();
    const project = useProject(projectUuid);
    const { data: flag, isLoading } = useServerFeatureFlag(
        FeatureFlags.AiPrincipals,
    );
    if (isLoading || project.isLoading) return <EmptyStateLoader />;
    if (
        !project.data ||
        !flag?.enabled ||
        !user.data?.ability.can('manage', subject('Project', project.data))
    )
        return (
            <SuboptimalState title="Agent identity settings are not available." />
        );
    if (project.data.warehouseConnection?.type !== WarehouseTypes.SNOWFLAKE)
        return (
            <SuboptimalState title="Agent identity is available for Snowflake projects." />
        );
    return (
        <ProjectAccess
            key={project.data.projectUuid}
            projectUuid={project.data.projectUuid}
        />
    );
};
