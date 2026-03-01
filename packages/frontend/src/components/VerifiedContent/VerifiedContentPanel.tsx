import { ContentType, type VerifiedContentListItem } from '@lightdash/common';
import {
    ActionIcon,
    Anchor,
    Badge,
    Button,
    Group,
    Menu,
    Paper,
    Stack,
    Text,
    Title,
    useMantineTheme,
} from '@mantine-8/core';
import { useDisclosure } from '@mantine-8/hooks';
import {
    IconChartBar,
    IconCircleX,
    IconDots,
    IconLayoutDashboard,
} from '@tabler/icons-react';
import {
    MantineReactTable,
    useMantineReactTable,
    type MRT_ColumnDef,
} from 'mantine-react-table';
import { useCallback, useMemo, useState, type FC } from 'react';
import { Link } from 'react-router';
import MantineIcon from '../common/MantineIcon';
import MantineModal from '../common/MantineModal';
import SuboptimalState from '../common/SuboptimalState/SuboptimalState';
import {
    useUnverifyChartMutation,
    useUnverifyDashboardMutation,
} from '../../hooks/useContentVerification';
import { useVerifiedContentList } from '../../hooks/useVerifiedContentList';

type Props = {
    projectUuid: string;
};

const VerifiedContentPanel: FC<Props> = ({ projectUuid }) => {
    const theme = useMantineTheme();
    const { data: verifiedContent, isLoading } =
        useVerifiedContentList(projectUuid);

    const [
        unverifyModalOpened,
        { open: openUnverifyModal, close: closeUnverifyModal },
    ] = useDisclosure(false);

    const [itemToUnverify, setItemToUnverify] =
        useState<VerifiedContentListItem | null>(null);

    const { mutate: unverifyChart } = useUnverifyChartMutation();
    const { mutate: unverifyDashboard } = useUnverifyDashboardMutation();

    const handleUnverify = useCallback(
        (item: VerifiedContentListItem) => {
            setItemToUnverify(item);
            openUnverifyModal();
        },
        [openUnverifyModal],
    );

    const handleConfirmUnverify = useCallback(() => {
        if (!itemToUnverify) return;
        if (itemToUnverify.contentType === ContentType.CHART) {
            unverifyChart(itemToUnverify.contentUuid);
        } else {
            unverifyDashboard(itemToUnverify.contentUuid);
        }
        closeUnverifyModal();
        setItemToUnverify(null);
    }, [itemToUnverify, closeUnverifyModal, unverifyChart, unverifyDashboard]);

    const items = useMemo(() => verifiedContent ?? [], [verifiedContent]);

    const columns: MRT_ColumnDef<VerifiedContentListItem>[] = useMemo(
        () => [
            {
                accessorKey: 'name',
                header: 'Name',
                enableSorting: false,
                size: 250,
                Cell: ({ row }) => {
                    const { contentType, contentUuid, name } = row.original;
                    const href =
                        contentType === ContentType.CHART
                            ? `/projects/${projectUuid}/saved/${contentUuid}`
                            : `/projects/${projectUuid}/dashboards/${contentUuid}`;
                    return (
                        <Anchor
                            component={Link}
                            to={href}
                            fz="sm"
                            fw={500}
                            truncate="end"
                        >
                            {name}
                        </Anchor>
                    );
                },
            },
            {
                accessorKey: 'contentType',
                header: 'Type',
                enableSorting: false,
                size: 120,
                Cell: ({ row }) => {
                    const isChart =
                        row.original.contentType === ContentType.CHART;
                    return (
                        <Badge
                            variant="light"
                            color={isChart ? 'blue' : 'violet'}
                            leftSection={
                                <MantineIcon
                                    icon={
                                        isChart
                                            ? IconChartBar
                                            : IconLayoutDashboard
                                    }
                                    size="sm"
                                />
                            }
                        >
                            {isChart ? 'Chart' : 'Dashboard'}
                        </Badge>
                    );
                },
            },
            {
                accessorKey: 'spaceName',
                header: 'Space',
                enableSorting: false,
                size: 150,
                Cell: ({ row }) => (
                    <Text fz="sm" c="ldGray.7">
                        {row.original.spaceName}
                    </Text>
                ),
            },
            {
                accessorKey: 'verifiedBy',
                header: 'Verified By',
                enableSorting: false,
                size: 150,
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
                header: 'Verified At',
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
                id: 'actions',
                header: 'Actions',
                enableSorting: false,
                size: 80,
                Cell: ({ row }) => (
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
                                Remove verification
                            </Menu.Item>
                        </Menu.Dropdown>
                    </Menu>
                ),
            },
        ],
        [handleUnverify],
    );

    const table = useMantineReactTable({
        columns,
        data: items,
        enableSorting: false,
        enableColumnActions: false,
        enablePagination: false,
        enableBottomToolbar: false,
        enableTopToolbar: false,
        enableRowSelection: false,
        enableStickyHeader: true,
        state: {
            isLoading,
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
            style: { maxHeight: 'calc(100vh - 300px)' },
        },
        mantineTableProps: {
            highlightOnHover: true,
            withColumnBorders: Boolean(items.length),
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
        mantineTableBodyCellProps: () => ({
            h: 48,
            style: {
                padding: `${theme.spacing.xs} ${theme.spacing.md}`,
                borderRight: 'none',
                borderLeft: 'none',
                borderBottom: `1px solid ${theme.colors.ldGray[2]}`,
                borderTop: 'none',
            },
        }),
    });

    if (!isLoading && items.length === 0) {
        return (
            <Paper p="xl">
                <SuboptimalState
                    icon={IconCircleX}
                    title="No verified content"
                    description="Charts and dashboards that are verified will appear here."
                />
            </Paper>
        );
    }

    return (
        <Stack gap="md">
            <Group gap="apart">
                <Title order={4}>Verified content</Title>
            </Group>
            <MantineReactTable table={table} />

            <MantineModal
                opened={unverifyModalOpened}
                onClose={closeUnverifyModal}
                title="Remove verification?"
                description="This will remove the verified badge from this content. You can verify it again later."
                actions={
                    <Button color="red" onClick={handleConfirmUnverify}>
                        Remove
                    </Button>
                }
            />
        </Stack>
    );
};

export default VerifiedContentPanel;
