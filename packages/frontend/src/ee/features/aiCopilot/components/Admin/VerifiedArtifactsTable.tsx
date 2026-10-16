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
import { useTranslation } from 'react-i18next';
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

type Props = {
    onArtifactSelect: (artifact: AiAgentVerifiedArtifact) => void;
    selectedArtifactVersionUuid: string | null;
};

export const VerifiedArtifactsTable: FC<Props> = ({
    onArtifactSelect,
    selectedArtifactVersionUuid,
}) => {
    const { t } = useTranslation('aiCopilotAdmin');
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
                header: t('verifiedArtifacts.columns.title'),
                enableSorting: false,
                size: 200,
                Cell: ({ row }) => {
                    const title =
                        row.original.title || t('verifiedArtifacts.untitled');
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
                header: t('verifiedArtifacts.columns.verifiedBy'),
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
                header: t('verifiedArtifacts.columns.verifiedAt'),
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
                header: t('verifiedArtifacts.columns.references'),
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
                header: t('verifiedArtifacts.columns.actions'),
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
                                    {t('verifiedArtifacts.remove')}
                                </Menu.Item>

                                <Menu.Item
                                    leftSection={<MantineIcon icon={IconEye} />}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleViewArtifact(row.original);
                                    }}
                                >
                                    {t('verifiedArtifacts.viewArtifact')}
                                </Menu.Item>
                            </Menu.Dropdown>
                        </Menu>
                    );
                },
            },
        ],
        [canManageAgent, handleUnverify, handleViewArtifact, t],
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
                        {t('verifiedArtifacts.loadingMore')}
                    </Text>
                ) : (
                    <Group gap="xs">
                        <Text fz="xs" c="ldGray.8">
                            {hasNextPage
                                ? t('verifiedArtifacts.scrollForMore')
                                : t('verifiedArtifacts.allLoaded')}
                        </Text>
                        <Text fz="xs" fw={400} c="dimmed">
                            {hasNextPage
                                ? t('verifiedArtifacts.loadedOf', {
                                      loaded: artifacts.length,
                                      total: totalResults,
                                  })
                                : t('verifiedArtifacts.loadedCount', {
                                      count: artifacts.length,
                                  })}
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
                    title={t('verifiedArtifacts.emptyTitle')}
                    description={t('verifiedArtifacts.emptyDescription')}
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
                title={t('verifiedArtifacts.unverifyTitle')}
                description={t('verifiedArtifacts.unverifyDescription')}
                actions={
                    <Button color="red" onClick={handleConfirmUnverify}>
                        {t('actions.remove', { ns: 'common' })}
                    </Button>
                }
            />
        </>
    );
};
