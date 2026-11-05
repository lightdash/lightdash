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
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconCircleX, IconDots, IconEye } from '@tabler/icons-react';
import { useCallback, useMemo, useState, type FC } from 'react';
import { useNavigate, useParams } from 'react-router';
import {
    ContentTable,
    useContentTable,
    type ContentTableColumnDef,
} from '../../../../../components/common/ContentTable';
import MantineIcon from '../../../../../components/common/MantineIcon';
import MantineModal from '../../../../../components/common/MantineModal';
import SuboptimalState from '../../../../../components/common/SuboptimalState/SuboptimalState';
import { useProjectUuid } from '../../../../../hooks/useProjectUuid';
import { useInfiniteVerifiedArtifacts } from '../../hooks/useAiAgentAdmin';
import { useSetArtifactVersionVerified } from '../../hooks/useAiAgentArtifacts';
import { useAiAgentPermission } from '../../hooks/useAiAgentPermission';
import adminClasses from './AdminTable.module.css';

type Props = {
    onArtifactSelect: (artifact: AiAgentVerifiedArtifact) => void;
    selectedArtifactVersionUuid: string | null;
};

export const VerifiedArtifactsTable: FC<Props> = ({
    onArtifactSelect,
    selectedArtifactVersionUuid,
}) => {
    const theme = useMantineTheme();
    const { agentUuid } = useParams();
    const projectUuid = useProjectUuid();
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

    const columns: ContentTableColumnDef<AiAgentVerifiedArtifact>[] = useMemo(
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
            //
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
                                <Text fz="xs" c="dimmed" maw={200} truncate>
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
                        <Text fz="sm" c="dimmed">
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
                        <Text fz="sm" c="dimmed">
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
                        <Text fz="sm" c="dimmed">
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
                        <Menu position="bottom-end">
                            <Menu.Target>
                                <ActionIcon
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

    const table = useContentTable({
        columns,
        data: artifacts,
        enableSorting: false,
        enablePagination: false,
        enableBottomToolbar: true,
        enableTopToolbar: false,
        enableRowSelection: false,
        enableStickyHeader: true,
        mantineTableBodyRowProps: ({ row }) => ({
            onClick: () => onArtifactSelect(row.original),
            'data-selected':
                selectedArtifactVersionUuid === row.original.versionUuid ||
                undefined,
        }),
        state: {
            isLoading,
            showProgressBars: isFetchingNextPage,
        },
        mantineTableContainerProps: {
            mah: 'calc(100vh - 200px)',
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
        mantineTableBodyCellProps: { h: 48 },
        renderBottomToolbar: () => (
            <Box
                p={`${theme.spacing.sm} ${theme.spacing.xl} ${theme.spacing.md} ${theme.spacing.xl}`}
                fz="xs"
                fw={500}
                className={adminClasses.loadMoreFooter}
            >
                {isFetching ? (
                    <Text fz="xs">Loading more...</Text>
                ) : (
                    <Group gap="xs">
                        <Text fz="xs">
                            {hasNextPage
                                ? 'Scroll for more results'
                                : 'All results loaded'}
                        </Text>
                        <Text fz="xs" fw={400} c="dimmed">
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
            <ContentTable table={table} />

            <MantineModal
                opened={unverifyModalOpened}
                onClose={closeUnverifyModal}
                role="alertdialog"
                title="Remove from verified answers?"
                description="This answer will no longer be used as a reference in future conversations. You can verify it again later."
                actions={
                    <Button color="red" onClick={handleConfirmUnverify}>
                        Remove
                    </Button>
                }
            />
        </>
    );
};
