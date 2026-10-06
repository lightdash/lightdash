import { subject } from '@casl/ability';
import {
    AiCredentialMethod,
    FeatureFlags,
    type AiPrincipal,
    type AiWarehouseCapabilities,
} from '@lightdash/common';
import {
    Alert,
    Button,
    Group,
    Loader,
    Modal,
    Pagination,
    Select,
    Stack,
    Table,
    Text,
    Title,
} from '@mantine/core';
import { useState } from 'react';
import { useParams } from 'react-router';
import {
    SettingsPage,
    SettingsPageContainer,
} from '../../components/common/Settings/SettingsPage';
import { useProject } from '../../hooks/useProject';
import { useServerFeatureFlag } from '../../hooks/useServerOrClientFeatureFlag';
import { useWarehouseConnections } from '../../hooks/useWarehouseConnections';
import useApp from '../../providers/App/useApp';
import { AiPolicyEditor } from './AiPolicyEditor';
import { AiPrincipalStatusBadge } from './AiPrincipalStatusBadge';
import { AiSetupScriptDrawer } from './AiSetupScriptDrawer';
import {
    useAiAccessAudit,
    useAiAccessCapabilities,
    useAiAccessPolicy,
    useAiPrincipals,
    useDeleteAiPrincipal,
    useRegenerateAiSecret,
    useTestAiPrincipal,
} from './api';
const Principals = ({
    projectUuid,
    connection,
    capabilities,
    onSetup,
}: {
    projectUuid: string;
    connection: string | null;
    capabilities: AiWarehouseCapabilities;
    onSetup: (uuid: string) => void;
}) => {
    const query = useAiPrincipals(projectUuid, connection);
    const test = useTestAiPrincipal(projectUuid, connection);
    const regenerate = useRegenerateAiSecret(projectUuid, connection);
    const remove = useDeleteAiPrincipal(projectUuid, connection);
    const [deleting, setDeleting] = useState<AiPrincipal | null>(null);
    return (
        <Stack>
            <Title order={5}>Principals</Title>
            {query.isLoading ? (
                <Loader />
            ) : query.isError ? (
                <Alert color="red">Could not load principals.</Alert>
            ) : !query.data?.length ? (
                <Text size="sm" c="dimmed">
                    Saving a group or shared policy creates the principal rows.
                    Person and twin rows appear when each person first uses AI.
                </Text>
            ) : (
                <Table.ScrollContainer minWidth={800}>
                    <Table>
                        <Table.Thead>
                            <Table.Tr>
                                {[
                                    'Reference',
                                    'Kind',
                                    'Status',
                                    'Last probe',
                                    'Actions',
                                ].map((label) => (
                                    <Table.Th key={label}>{label}</Table.Th>
                                ))}
                            </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                            {query.data.map((principal) => {
                                const capability =
                                    capabilities.principals[principal.kind];
                                return (
                                    <Table.Tr key={principal.aiPrincipalUuid}>
                                        <Table.Td>{principal.ref}</Table.Td>
                                        <Table.Td>{principal.kind}</Table.Td>
                                        <Table.Td>
                                            <AiPrincipalStatusBadge
                                                principal={principal}
                                            />
                                        </Table.Td>
                                        <Table.Td>
                                            {principal.lastProbe
                                                ? new Date(
                                                      principal.lastProbe
                                                          .checkedAt,
                                                  ).toLocaleString()
                                                : 'Never'}
                                        </Table.Td>
                                        <Table.Td>
                                            <Group gap="xs">
                                                <Button
                                                    size="xs"
                                                    variant="default"
                                                    loading={
                                                        test.isLoading &&
                                                        test.variables ===
                                                            principal.aiPrincipalUuid
                                                    }
                                                    onClick={() =>
                                                        test.mutate(
                                                            principal.aiPrincipalUuid,
                                                        )
                                                    }
                                                >
                                                    Test
                                                </Button>
                                                <Button
                                                    size="xs"
                                                    variant="default"
                                                    onClick={() =>
                                                        onSetup(
                                                            principal.aiPrincipalUuid,
                                                        )
                                                    }
                                                >
                                                    Setup script
                                                </Button>
                                                {capability.available &&
                                                    capability.method ===
                                                        AiCredentialMethod.KEY && (
                                                        <Button
                                                            size="xs"
                                                            variant="default"
                                                            loading={
                                                                regenerate.isLoading &&
                                                                regenerate.variables ===
                                                                    principal.aiPrincipalUuid
                                                            }
                                                            onClick={() =>
                                                                regenerate.mutate(
                                                                    principal.aiPrincipalUuid,
                                                                    {
                                                                        onSuccess:
                                                                            () =>
                                                                                onSetup(
                                                                                    principal.aiPrincipalUuid,
                                                                                ),
                                                                    },
                                                                )
                                                            }
                                                        >
                                                            Regenerate secret
                                                        </Button>
                                                    )}
                                                <Button
                                                    size="xs"
                                                    color="red"
                                                    variant="subtle"
                                                    onClick={() =>
                                                        setDeleting(principal)
                                                    }
                                                >
                                                    Delete
                                                </Button>
                                            </Group>
                                        </Table.Td>
                                    </Table.Tr>
                                );
                            })}
                        </Table.Tbody>
                    </Table>
                </Table.ScrollContainer>
            )}
            <Modal
                opened={deleting !== null}
                onClose={() => setDeleting(null)}
                title="Delete AI principal"
            >
                <Stack>
                    <Text>
                        Delete {deleting?.ref}? AI queries using this principal
                        will stop until it is set up again.
                    </Text>
                    <Group justify="flex-end">
                        <Button
                            variant="default"
                            onClick={() => setDeleting(null)}
                        >
                            Cancel
                        </Button>
                        <Button
                            color="red"
                            loading={remove.isLoading}
                            onClick={() =>
                                deleting &&
                                remove.mutate(deleting.aiPrincipalUuid, {
                                    onSuccess: () => setDeleting(null),
                                })
                            }
                        >
                            Delete
                        </Button>
                    </Group>
                </Stack>
            </Modal>
        </Stack>
    );
};
const Audit = ({ projectUuid }: { projectUuid: string }) => {
    const [page, setPage] = useState(1);
    const query = useAiAccessAudit(projectUuid, null, page);
    return (
        <Stack>
            <Title order={5}>Query audit</Title>
            <Text size="sm" c="dimmed">
                Queries across all project connections.
            </Text>
            {query.isLoading ? (
                <Loader />
            ) : query.isError ? (
                <Alert color="red">Could not load the audit.</Alert>
            ) : !query.data?.data.length ? (
                <Text c="dimmed">No AI queries yet.</Text>
            ) : (
                <Table.ScrollContainer minWidth={650}>
                    <Table>
                        <Table.Thead>
                            <Table.Tr>
                                {[
                                    'Time',
                                    'Person',
                                    'Principal',
                                    'Transport',
                                    'Probe ok',
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
                                        {row.personTag ||
                                            row.userUuid ||
                                            'Unknown'}
                                    </Table.Td>
                                    <Table.Td>{row.principalRef}</Table.Td>
                                    <Table.Td>{row.transport.kind}</Table.Td>
                                    <Table.Td>
                                        {row.probeOk ? 'Yes' : 'No'}
                                    </Table.Td>
                                </Table.Tr>
                            ))}
                        </Table.Tbody>
                    </Table>
                </Table.ScrollContainer>
            )}
            <Pagination
                total={Math.max(1, query.data?.pagination.totalPageCount ?? 1)}
                value={page}
                onChange={setPage}
            />
        </Stack>
    );
};
const ConnectionAccess = ({
    projectUuid,
    connection,
}: {
    projectUuid: string;
    connection: string | null;
}) => {
    const policy = useAiAccessPolicy(projectUuid, connection);
    const capabilities = useAiAccessCapabilities(projectUuid, connection);
    const [script, setScript] = useState<{ principal: string | null } | null>(
        null,
    );
    if (policy.isLoading || capabilities.isLoading) return <Loader />;
    if (policy.isError || capabilities.isError)
        return <Alert color="red">Could not load AI access settings.</Alert>;
    return (
        <Stack gap="xl">
            <AiPolicyEditor
                projectUuid={projectUuid}
                connection={connection}
                policy={policy.data}
                capabilities={capabilities.data}
                onSetup={() => setScript({ principal: null })}
            />
            <Principals
                projectUuid={projectUuid}
                connection={connection}
                capabilities={capabilities.data}
                onSetup={(principal) => setScript({ principal })}
            />
            {script && (
                <AiSetupScriptDrawer
                    projectUuid={projectUuid}
                    connection={connection}
                    principal={script.principal}
                    onClose={() => setScript(null)}
                />
            )}
        </Stack>
    );
};
const ProjectAccess = ({ projectUuid }: { projectUuid: string }) => {
    const connections = useWarehouseConnections(projectUuid);
    const [connection, setConnection] = useState<string | null>(null);
    return (
        <SettingsPage
            title="AI access"
            description="Choose the warehouse principal and rules for AI queries."
        >
            <SettingsPageContainer>
                <Stack gap="xl">
                    {(connections.data?.connections.length ?? 0) > 1 && (
                        <Select
                            label="Warehouse connection"
                            value={connection ?? 'original'}
                            data={connections.data!.connections.map((item) => ({
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
                    )}
                    <ConnectionAccess
                        key={connection ?? 'original'}
                        projectUuid={projectUuid}
                        connection={connection}
                    />
                    <Audit projectUuid={projectUuid} />
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
    if (isLoading || project.isLoading) return <Loader />;
    if (
        !project.data ||
        !flag?.enabled ||
        !user.data?.ability.can('update', subject('Project', project.data))
    )
        return <Alert color="red">AI access settings are not available.</Alert>;
    return (
        <ProjectAccess
            key={project.data.projectUuid}
            projectUuid={project.data.projectUuid}
        />
    );
};
