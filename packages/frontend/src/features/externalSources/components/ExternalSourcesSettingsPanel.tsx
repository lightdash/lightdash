import {
    assertUnreachable,
    ExternalSourceStatus,
    ExternalSourceType,
    type ExternalSource,
    type ExternalSourceRef,
} from '@lightdash/common';
import {
    ActionIcon,
    Badge,
    Button,
    Group,
    Menu,
    Paper,
    Stack,
    Table,
    Text,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
    IconDatabaseExport,
    IconDots,
    IconExternalLink,
    IconFileSpreadsheet,
    IconInfoCircle,
    IconPencil,
    IconPlus,
    IconRefresh,
    IconTrash,
    IconUpload,
} from '@tabler/icons-react';
import { useState, type FC } from 'react';
import { useNavigate } from 'react-router';
import MantineIcon from '../../../components/common/MantineIcon';
import SuboptimalState from '../../../components/common/SuboptimalState/SuboptimalState';
import {
    useExternalSources,
    useRefreshExternalSource,
} from '../hooks/useExternalSources';
import { getExternalSourceTypeLabel } from '../utils/sourceTypeLabel';
import { AddDataModal } from './AddDataModal';
import { DeleteExternalSourceModal } from './DeleteExternalSourceModal';
import { RenameExternalSourceModal } from './RenameExternalSourceModal';
import { ReplaceCsvFileModal } from './ReplaceCsvFileModal';
import { SourceTablePreviewDrawer } from './SourceTablePreviewDrawer';

const StatusBadge: FC<{ source: ExternalSource }> = ({ source }) => {
    switch (source.status) {
        case ExternalSourceStatus.READY:
            return (
                <Badge variant="light" color="green">
                    Ready
                </Badge>
            );
        case ExternalSourceStatus.SYNCING:
        case ExternalSourceStatus.STAGED:
            return (
                <Badge variant="light" color="blue">
                    Syncing
                </Badge>
            );
        case ExternalSourceStatus.ERROR:
            return (
                <Badge
                    variant="light"
                    color="red"
                    title={source.errorMessage ?? undefined}
                >
                    Error
                </Badge>
            );
        default:
            return assertUnreachable(
                source.status,
                'Unknown external source status',
            );
    }
};

type ModalTarget = {
    sourceRef: ExternalSourceRef;
    label: string;
};

export const ExternalSourcesSettingsPanel: FC<{ projectUuid: string }> = ({
    projectUuid,
}) => {
    const navigate = useNavigate();
    const sourcesResult = useExternalSources(projectUuid);
    const refreshMutation = useRefreshExternalSource(projectUuid);
    const [isAddOpen, addHandlers] = useDisclosure(false);
    const [renameTarget, setRenameTarget] = useState<ModalTarget>();
    const [replaceTarget, setReplaceTarget] = useState<ModalTarget>();
    const [deleteTarget, setDeleteTarget] = useState<ModalTarget>();
    const [previewTarget, setPreviewTarget] = useState<ModalTarget>();

    const sources = sourcesResult.data ?? [];

    const toRef = (source: ExternalSource): ExternalSourceRef | undefined =>
        source.tables[0]
            ? {
                  sourceUuid: source.sourceUuid,
                  tableUuid: source.tables[0].tableUuid,
                  sourceType: source.type,
              }
            : undefined;

    return (
        <Stack gap="md">
            <Group justify="flex-end">
                <Button
                    leftSection={<MantineIcon icon={IconPlus} />}
                    onClick={addHandlers.open}
                >
                    Add source
                </Button>
            </Group>
            {sources.length === 0 && !sourcesResult.isInitialLoading && (
                <SuboptimalState
                    icon={IconDatabaseExport}
                    title="No external sources yet"
                    description="Upload a CSV to query it alongside your warehouse."
                    action={
                        <Button
                            variant="default"
                            onClick={addHandlers.open}
                            leftSection={<MantineIcon icon={IconPlus} />}
                        >
                            Add source
                        </Button>
                    }
                />
            )}
            {sources.length > 0 && (
                <Paper withBorder radius="md">
                    <Table verticalSpacing="sm" horizontalSpacing="md">
                        <Table.Thead>
                            <Table.Tr>
                                <Table.Th>Source</Table.Th>
                                <Table.Th>Type</Table.Th>
                                <Table.Th>Rows</Table.Th>
                                <Table.Th>Last refreshed</Table.Th>
                                <Table.Th>Status</Table.Th>
                                <Table.Th w={40} />
                            </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                            {sources.map((source) => {
                                const table = source.tables[0];
                                const label = table?.label ?? source.name;
                                const sourceRef = toRef(source);
                                return (
                                    <Table.Tr key={source.sourceUuid}>
                                        <Table.Td>
                                            <Group gap="xs" wrap="nowrap">
                                                <MantineIcon
                                                    icon={IconFileSpreadsheet}
                                                    color="ldGray.7"
                                                />
                                                <Text fz="sm" fw={600}>
                                                    {label}
                                                </Text>
                                            </Group>
                                        </Table.Td>
                                        <Table.Td>
                                            <Text fz="sm" c="dimmed">
                                                {getExternalSourceTypeLabel(
                                                    source.type,
                                                )}
                                            </Text>
                                        </Table.Td>
                                        <Table.Td>
                                            <Text fz="sm">
                                                {table?.rowCount ?? '–'}
                                            </Text>
                                        </Table.Td>
                                        <Table.Td>
                                            <Text fz="sm" c="dimmed">
                                                {source.lastRefreshedAt
                                                    ? new Date(
                                                          source.lastRefreshedAt,
                                                      ).toLocaleString()
                                                    : '–'}
                                            </Text>
                                        </Table.Td>
                                        <Table.Td>
                                            <StatusBadge source={source} />
                                        </Table.Td>
                                        <Table.Td>
                                            {sourceRef && (
                                                <Menu withArrow>
                                                    <Menu.Target>
                                                        <ActionIcon
                                                            variant="subtle"
                                                            color="gray"
                                                            aria-label={`Actions for ${label}`}
                                                        >
                                                            <MantineIcon
                                                                icon={IconDots}
                                                            />
                                                        </ActionIcon>
                                                    </Menu.Target>
                                                    <Menu.Dropdown>
                                                        <Menu.Item
                                                            leftSection={
                                                                <MantineIcon
                                                                    icon={
                                                                        IconExternalLink
                                                                    }
                                                                />
                                                            }
                                                            onClick={() =>
                                                                navigate(
                                                                    `/projects/${projectUuid}/tables/${table.name}`,
                                                                )
                                                            }
                                                        >
                                                            Open in Explorer
                                                        </Menu.Item>
                                                        <Menu.Item
                                                            leftSection={
                                                                <MantineIcon
                                                                    icon={
                                                                        IconInfoCircle
                                                                    }
                                                                />
                                                            }
                                                            onClick={() =>
                                                                setPreviewTarget(
                                                                    {
                                                                        sourceRef,
                                                                        label,
                                                                    },
                                                                )
                                                            }
                                                        >
                                                            View details
                                                        </Menu.Item>
                                                        <Menu.Divider />
                                                        {source.type ===
                                                            ExternalSourceType.GOOGLE_SHEETS && (
                                                            <Menu.Item
                                                                leftSection={
                                                                    <MantineIcon
                                                                        icon={
                                                                            IconRefresh
                                                                        }
                                                                    />
                                                                }
                                                                onClick={() =>
                                                                    refreshMutation.mutate(
                                                                        source.sourceUuid,
                                                                    )
                                                                }
                                                            >
                                                                Refresh
                                                            </Menu.Item>
                                                        )}
                                                        {source.type ===
                                                            ExternalSourceType.CSV && (
                                                            <Menu.Item
                                                                leftSection={
                                                                    <MantineIcon
                                                                        icon={
                                                                            IconUpload
                                                                        }
                                                                    />
                                                                }
                                                                onClick={() =>
                                                                    setReplaceTarget(
                                                                        {
                                                                            sourceRef,
                                                                            label,
                                                                        },
                                                                    )
                                                                }
                                                            >
                                                                Replace file
                                                            </Menu.Item>
                                                        )}
                                                        <Menu.Item
                                                            leftSection={
                                                                <MantineIcon
                                                                    icon={
                                                                        IconPencil
                                                                    }
                                                                />
                                                            }
                                                            onClick={() =>
                                                                setRenameTarget(
                                                                    {
                                                                        sourceRef,
                                                                        label,
                                                                    },
                                                                )
                                                            }
                                                        >
                                                            Rename
                                                        </Menu.Item>
                                                        <Menu.Divider />
                                                        <Menu.Item
                                                            color="red"
                                                            leftSection={
                                                                <MantineIcon
                                                                    icon={
                                                                        IconTrash
                                                                    }
                                                                />
                                                            }
                                                            onClick={() =>
                                                                setDeleteTarget(
                                                                    {
                                                                        sourceRef,
                                                                        label,
                                                                    },
                                                                )
                                                            }
                                                        >
                                                            Delete
                                                        </Menu.Item>
                                                    </Menu.Dropdown>
                                                </Menu>
                                            )}
                                        </Table.Td>
                                    </Table.Tr>
                                );
                            })}
                        </Table.Tbody>
                    </Table>
                </Paper>
            )}
            <AddDataModal
                projectUuid={projectUuid}
                opened={isAddOpen}
                onClose={addHandlers.close}
            />
            {renameTarget && (
                <RenameExternalSourceModal
                    projectUuid={projectUuid}
                    sourceRef={renameTarget.sourceRef}
                    currentLabel={renameTarget.label}
                    opened
                    onClose={() => setRenameTarget(undefined)}
                />
            )}
            {replaceTarget && (
                <ReplaceCsvFileModal
                    projectUuid={projectUuid}
                    sourceRef={replaceTarget.sourceRef}
                    tableLabel={replaceTarget.label}
                    opened
                    onClose={() => setReplaceTarget(undefined)}
                />
            )}
            {deleteTarget && (
                <DeleteExternalSourceModal
                    projectUuid={projectUuid}
                    sourceRef={deleteTarget.sourceRef}
                    tableLabel={deleteTarget.label}
                    opened
                    onClose={() => setDeleteTarget(undefined)}
                />
            )}
            <SourceTablePreviewDrawer
                projectUuid={projectUuid}
                sourceRef={previewTarget?.sourceRef}
                tableLabel={previewTarget?.label ?? ''}
                onClose={() => setPreviewTarget(undefined)}
            />
        </Stack>
    );
};
