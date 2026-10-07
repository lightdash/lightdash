import {
    AiCredentialMethod,
    AiPrincipalKind,
    type AiPrincipal,
    type AiWarehouseCapabilities,
} from '@lightdash/common';
import {
    ActionIcon,
    Button,
    Group,
    Menu,
    Stack,
    Table,
    Text,
    Title,
    Tooltip,
} from '@mantine/core';
import { IconDots } from '@tabler/icons-react';
import { useState } from 'react';
import EmptyStateLoader from '../../components/common/EmptyStateLoader';
import InlineErrorState from '../../components/common/InlineErrorState';
import MantineIcon from '../../components/common/MantineIcon';
import MantineModal from '../../components/common/MantineModal';
import { AiPrincipalStatusBadge } from './AiPrincipalStatusBadge';
import {
    useAiPrincipals,
    useDeleteAiPrincipal,
    useRegenerateAiSecret,
    useTestAiPrincipal,
} from './api';
const principalLabels: Record<AiPrincipalKind, string> = {
    [AiPrincipalKind.PERSON]: 'Marked person',
    [AiPrincipalKind.GROUP]: 'Per group',
    [AiPrincipalKind.TWIN]: 'Per person',
    [AiPrincipalKind.SHARED]: 'One shared',
};
export const Principals = ({
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
                <EmptyStateLoader />
            ) : query.isError ? (
                <InlineErrorState
                    message="Could not load principals."
                    onRetry={() => void query.refetch()}
                />
            ) : !query.data?.length ? (
                <Text size="sm" c="dimmed">
                    Saving a group or shared policy creates the principal rows.
                    Per-person rows appear when each person first uses an agent.
                </Text>
            ) : (
                <Table.ScrollContainer minWidth={800}>
                    <Table>
                        <Table.Thead>
                            <Table.Tr>
                                {[
                                    'Reference',
                                    'Type',
                                    'Status',
                                    'Last checked',
                                    'Actions',
                                ].map((label) => (
                                    <Table.Th
                                        key={label}
                                        miw={
                                            label === 'Status' ? 160 : undefined
                                        }
                                    >
                                        {label}
                                    </Table.Th>
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
                                        <Table.Td>
                                            {principalLabels[principal.kind]}
                                        </Table.Td>
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
                                            <Group gap="xs" wrap="nowrap">
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
                                                <Menu
                                                    position="bottom-end"
                                                    withArrow
                                                >
                                                    <Menu.Target>
                                                        <Tooltip label="Principal actions">
                                                            <ActionIcon
                                                                aria-label={`Actions for ${principal.ref}`}
                                                            >
                                                                <MantineIcon
                                                                    icon={
                                                                        IconDots
                                                                    }
                                                                />
                                                            </ActionIcon>
                                                        </Tooltip>
                                                    </Menu.Target>
                                                    <Menu.Dropdown>
                                                        <Menu.Item
                                                            onClick={() =>
                                                                onSetup(
                                                                    principal.aiPrincipalUuid,
                                                                )
                                                            }
                                                        >
                                                            Setup script
                                                        </Menu.Item>
                                                        {capability.available &&
                                                            capability.method ===
                                                                AiCredentialMethod.KEY && (
                                                                <Menu.Item
                                                                    disabled={
                                                                        regenerate.isLoading
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
                                                                    Regenerate
                                                                    secret
                                                                </Menu.Item>
                                                            )}
                                                        <Menu.Item
                                                            color="red"
                                                            onClick={() =>
                                                                setDeleting(
                                                                    principal,
                                                                )
                                                            }
                                                        >
                                                            Delete
                                                        </Menu.Item>
                                                    </Menu.Dropdown>
                                                </Menu>
                                            </Group>
                                        </Table.Td>
                                    </Table.Tr>
                                );
                            })}
                        </Table.Tbody>
                    </Table>
                </Table.ScrollContainer>
            )}
            <MantineModal
                opened={deleting !== null}
                onClose={() => setDeleting(null)}
                title="Delete principal"
                variant="delete"
                description={`Delete ${deleting?.ref}? Agent queries using this principal will stop until it is set up again.`}
                confirmLoading={remove.isLoading}
                onConfirm={() =>
                    deleting &&
                    remove.mutate(deleting.aiPrincipalUuid, {
                        onSuccess: () => setDeleting(null),
                    })
                }
            />
        </Stack>
    );
};
