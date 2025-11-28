import { type AiAgentVerifiedArtifact } from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Button,
    Group,
    Menu,
    Paper,
    Stack,
    Text,
    useMantineTheme,
} from '@mantine-8/core';
import { useDisclosure } from '@mantine-8/hooks';
import { IconCircleX, IconDots, IconEye } from '@tabler/icons-react';
import {
    MantineReactTable,
    useMantineReactTable,
    type MRT_ColumnDef,
} from 'mantine-react-table';
import { useCallback, useMemo, useState, type FC } from 'react';
import { useNavigate, useParams } from 'react-router';
import MantineIcon from '../../../../../components/common/MantineIcon';
import MantineModal from '../../../../../components/common/MantineModal';
import SuboptimalState from '../../../../../components/common/SuboptimalState/SuboptimalState';
import { useInfiniteVerifiedArtifacts } from '../../hooks/useAiAgentAdmin';
import { useSetArtifactVersionVerified } from '../../hooks/useAiAgentArtifacts';
import { useAiAgentPermission } from '../../hooks/useAiAgentPermission';

type Props = {
    onArtifactSelect: (artifact: AiAgentVerifiedArtifact) => void;
    selectedArtifactVersionUuid: string | null;
};

export const VerifiedArtifactsTable: FC<Props> = ({
    onArtifactSelect,
    selectedArtifactVersionUuid,
}) => {
    const theme = useMantineTheme();
    const { projectUuid, agentUuid } = useParams();
    const navigate = useNavigate();
    const canManageAgent = useAiAgentPermission({
        action: 'manage',
        projectUuid: projectUuid!,
    });

    const [
        unverifyModalOpened,
        { open: openUnverifyModal, close: closeUnverifyModal },
    ] = useDisclosure(false);

    const [artifactToUnverify, setArtifactToUnverify] =
        useState<AiAgentVerifiedArtifact | null>(null);

    const {
        data: artifactsData,
        isLoading,
        isFetching,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage,
    } = useInfiniteVerifiedArtifacts(projectUuid!, agentUuid!, {
        pageSize: 50,
    });

    const { mutate: setVerified } = useSetArtifactVersionVerified(
        projectUuid!,
        agentUuid!,
        { showSuccessAction: false },
    );

    const artifacts = useMemo(() => {
        return artifactsData?.pages?.flatMap((page) => page.data) ?? [];
    }, [artifactsData]);

    const totalResults = useMemo(() => {
        return artifactsData?.pages?.[0]?.pagination?.totalResults ?? 0;
    }, [artifactsData]);

    const handleUnverify = useCallback(
        (artifact: AiAgentVerifiedArtifact) => {
            setArtifactToUnverify(artifact);
            openUnverifyModal();
        },
        [openUnverifyModal],
    );

    const handleConfirmUnverify = useCallback(() => {
        if (!artifactToUnverify) return;
        setVerified({
            artifactUuid: artifactToUnverify.artifactUuid,
            versionUuid: artifactToUnverify.versionUuid,
            verified: false,
        });
        closeUnverifyModal();
        setArtifactToUnverify(null);
    }, [artifactToUnverify, closeUnverifyModal, setVerified]);

    const handleViewArtifact = useCallback(
        (artifact: AiAgentVerifiedArtifact) => {
            void navigate(
                `/projects/${projectUuid}/ai-agents/${agentUuid}/edit/verified-artifacts/${artifact.artifactUuid}?versionUuid=${artifact.versionUuid}&threadUuid=${artifact.threadUuid}&promptUuid=${artifact.promptUuid}`,
            );
        },
        [navigate, projectUuid, agentUuid],
    );

    const columns: MRT_ColumnDef<AiAgentVerifiedArtifact>[] = useMemo(
        () => [
            // {
            //     accessorKey: 'artifactType',
            //     header: 'Type',
            //     enableSorting: false,
            //     size: 120,
            //     Cell: ({ row }) => {
            //         const isChart = row.original.artifactType === 'chart';
            //         return (
            //             <Badge
            //                 variant="light"
            //                 color={isChart ? 'blue' : 'violet'}
            //                 leftSection={
            //                     <MantineIcon
            //                         icon={
            //                             isChart
            //                                 ? IconChartBar
            //                                 : IconLayoutDashboard
            //                         }
            //                         size="sm"
            //                     />
            //                 }
            //             >
            //                 {isChart ? 'Chart' : 'Dashboard'}
            //             </Badge>
            //         );
            //     },
            // },
            {
                accessorKey: 'title',
                header: 'Title',
                enableSorting: false,
                size: 200,
                Cell: ({ row }) => {
                    const title = row.original.title || 'Untitled';
                    return (
                        <Stack gap="xs">
                            <Text fz="sm" fw={500} truncate>
                                {title}
                            </Text>
                            {row.original.description && (
                                <Text fz="xs" c="ldGray.6" maw={200} truncate>
                                    {row.original.description}
                                </Text>
                            )}
                        </Stack>
                    );
                },
            },
            {
                accessorKey: 'verifiedBy',
                header: 'Verified By',
                enableSorting: false,
                size: 180,
                Cell: ({ row }) => {
                    const { firstName, lastName } = row.original.verifiedBy;
                    return (
                        <Text fz="sm" c="ldGray.7">
                            {firstName} {lastName}
                        </Text>
                    );
                },
            },
            {
                accessorKey: 'verifiedAt',
                header: 'Verified Date',
                enableSorting: false,
                size: 150,
                Cell: ({ row }) => {
                    const date = new Date(row.original.verifiedAt);
                    return (
                        <Text fz="sm" c="ldGray.7">
                            {date.toLocaleDateString()}
                        </Text>
                    );
                },
            },
            {
                accessorKey: 'referenceCount',
                header: 'References',
                enableSorting: false,
                size: 120,
                Cell: ({ row }) => {
                    return (
                        <Text fz="sm" c="ldGray.7">
                            {row.original.referenceCount}
                        </Text>
                    );
                },
            },
            {
                id: 'actions',
                header: 'Actions',
                enableSorting: false,
                size: 60,
                Cell: ({ row }) => {
                    if (!canManageAgent) return null;
                    return (
                        <Menu withinPortal position="bottom-end">
                            <Menu.Target>
                                <ActionIcon
                                    variant="subtle"
                                    color="gray"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                    }}
                                >
                                    <MantineIcon icon={IconDots} />
                                </ActionIcon>
                            </Menu.Target>
                            <Menu.Dropdown>
                                <Menu.Item
                                    leftSection={
                                        <MantineIcon icon={IconCircleX} />
                                    }
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleUnverify(row.original);
                                    }}
                                >
                                    Remove from verified answers
                                </Menu.Item>

                                <Menu.Item
                                    leftSection={<MantineIcon icon={IconEye} />}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleViewArtifact(row.original);
                                    }}
                                >
                                    View artifact
                                </Menu.Item>
                            </Menu.Dropdown>
                        </Menu>
                    );
                },
            },
        ],
        [canManageAgent, handleUnverify, handleViewArtifact],
    );

    const table = useMantineReactTable({
        columns,
        data: artifacts,
        enableSorting: false,
        enableColumnActions: false,
        enablePagination: false,
        enableBottomToolbar: true,
        enableTopToolbar: false,
        enableRowSelection: false,
        enableStickyHeader: true,
        mantineTableBodyRowProps: ({ row }) => ({
            onClick: () => onArtifactSelect(row.original),
            style: {
                cursor: 'pointer',
                backgroundColor:
                    selectedArtifactVersionUuid === row.original.versionUuid
                        ? 'var(--mantine-color-ldGray-1)'
                        : undefined,
            },
        }),
        state: {
            isLoading,
            showProgressBars: isFetchingNextPage,
        },
        mantinePaperProps: {
            shadow: undefined,
            style: {
                border: `1px solid ${theme.colors.ldGray[2]}`,
                borderRadius: theme.spacing.sm,
                boxShadow: theme.shadows.subtle,
                display: 'flex',
                flexDirection: 'column',
            },
        },
        mantineTableContainerProps: {
            style: { maxHeight: 'calc(100vh - 200px)' },
            onScroll: (event: React.UIEvent<HTMLDivElement>) => {
                const { scrollTop, scrollHeight, clientHeight } =
                    event.currentTarget;
                if (
                    scrollHeight - scrollTop - clientHeight < 400 &&
                    hasNextPage &&
                    !isFetchingNextPage
                ) {
                    void fetchNextPage();
                }
            },
        },
        mantineTableProps: {
            highlightOnHover: true,
            withColumnBorders: Boolean(artifacts.length),
        },
        mantineTableHeadCellProps: (props) => {
            const isFirstColumn =
                props.table.getAllColumns().indexOf(props.column) === 0;
            const isLastColumn =
                props.table.getAllColumns().indexOf(props.column) ===
                props.table.getAllColumns().length - 1;

            return {
                bg: 'ldGray.0',
                h: '3xl',
                pos: 'relative',
                style: {
                    userSelect: 'none',
                    padding: `${theme.spacing.xs} ${theme.spacing.xl}`,
                    borderBottom: `1px solid ${theme.colors.ldGray[2]}`,
                    borderRight: props.column.getIsResizing()
                        ? `2px solid ${theme.colors.blue[3]}`
                        : `1px solid ${
                              isLastColumn || isFirstColumn
                                  ? 'transparent'
                                  : theme.colors.ldGray[2]
                          }`,
                    borderTop: 'none',
                    borderLeft: 'none',
                },
            };
        },
        mantineTableHeadRowProps: {
            sx: {
                boxShadow: 'none',
            },
        },
        mantineTableBodyCellProps: () => {
            return {
                h: 48,
                style: {
                    padding: `${theme.spacing.xs} ${theme.spacing.md}`,
                    borderRight: 'none',
                    borderLeft: 'none',
                    borderBottom: `1px solid ${theme.colors.ldGray[2]}`,
                    borderTop: 'none',
                },
            };
        },
        renderBottomToolbar: () => (
            <Box
                p={`${theme.spacing.sm} ${theme.spacing.xl} ${theme.spacing.md} ${theme.spacing.xl}`}
                fz="xs"
                fw={500}
                c="ldGray.8"
                style={{
                    borderTop: `1px solid ${theme.colors.ldGray[3]}`,
                }}
            >
                {isFetching ? (
                    <Text c="ldGray.8" fz="xs">
                        Loading more...
                    </Text>
                ) : (
                    <Group gap="xs">
                        <Text fz="xs" c="ldGray.8">
                            {hasNextPage
                                ? 'Scroll for more results'
                                : 'All results loaded'}
                        </Text>
                        <Text fz="xs" fw={400} c="ldGray.6">
                            {hasNextPage
                                ? `(${artifacts.length} of ${totalResults} loaded)`
                                : `(${artifacts.length})`}
                        </Text>
                    </Group>
                )}
            </Box>
        ),
    });

    if (!isLoading && artifacts.length === 0) {
        return (
            <Paper p="xl">
                <SuboptimalState
                    icon={IconCircleX}
                    title="No verified answers yet"
                    description="Verified answers will appear here once you mark them as verified in conversations."
                />
            </Paper>
        );
    }

    return (
        <>
            <MantineReactTable table={table} />

            <MantineModal
                opened={unverifyModalOpened}
                onClose={closeUnverifyModal}
                title="Remove from verified answers?"
            >
                <Stack>
                    <Text>
                        This answer will no longer be used as a reference in
                        future conversations. You can verify it again later.
                    </Text>
                    <Group justify="flex-end" mt="md">
                        <Button variant="default" onClick={closeUnverifyModal}>
                            Cancel
                        </Button>
                        <Button color="red" onClick={handleConfirmUnverify}>
                            Remove
                        </Button>
                    </Group>
                </Stack>
            </MantineModal>
        </>
    );
};
