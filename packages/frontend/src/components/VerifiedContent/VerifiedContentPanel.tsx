import { ContentType, type VerifiedContentListItem } from '@lightdash/common';
import {
    ActionIcon,
    Anchor,
    Button,
    Group,
    Menu,
    Stack,
    Text,
    Tooltip,
    useMantineTheme,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
    IconAppWindow,
    IconCircleX,
    IconDots,
    IconLayoutDashboard,
} from '@tabler/icons-react';
import { useCallback, useMemo, useState, type FC } from 'react';
import { Link } from 'react-router';
import {
    useUnverifyChartMutation,
    useUnverifyDashboardMutation,
    useUnverifyDataAppMutation,
} from '../../hooks/useContentVerification';
import { useVerifiedContentList } from '../../hooks/useVerifiedContentList';
import {
    ContentTable,
    useContentTable,
    type ContentTableColumnDef,
} from '../common/ContentTable';
import MantineIcon from '../common/MantineIcon';
import MantineModal from '../common/MantineModal';
import { getChartIcon } from '../common/ResourceIcon/utils';
import { SettingsEmptyState } from '../common/Settings/SettingsEmptyState';
import TruncatedText from '../common/TruncatedText';
import classes from './VerifiedContentPanel.module.css';

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
    const { mutate: unverifyDataApp } = useUnverifyDataAppMutation();

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
        } else if (itemToUnverify.contentType === ContentType.DASHBOARD) {
            unverifyDashboard(itemToUnverify.contentUuid);
        } else {
            unverifyDataApp({
                projectUuid,
                appUuid: itemToUnverify.contentUuid,
            });
        }
        closeUnverifyModal();
        setItemToUnverify(null);
    }, [
        itemToUnverify,
        closeUnverifyModal,
        unverifyChart,
        unverifyDashboard,
        unverifyDataApp,
        projectUuid,
    ]);

    const items = useMemo(() => verifiedContent ?? [], [verifiedContent]);

    const columns: ContentTableColumnDef<VerifiedContentListItem>[] = useMemo(
        () => [
            {
                accessorKey: 'name',
                header: 'Name',
                enableSorting: false,
                size: 320,
                minSize: 160,
                Cell: ({ row }) => {
                    const item = row.original;
                    const isChart = item.contentType === ContentType.CHART;
                    const isDataApp = item.contentType === ContentType.DATA_APP;
                    const href = isChart
                        ? `/projects/${projectUuid}/saved/${item.slug}`
                        : isDataApp
                          ? `/projects/${projectUuid}/apps/${item.contentUuid}/view`
                          : `/projects/${projectUuid}/dashboards/${item.slug}`;
                    const typeLabel = isChart
                        ? 'Chart'
                        : isDataApp
                          ? 'Data app'
                          : 'Dashboard';
                    const typeIcon = isChart
                        ? getChartIcon(item.chartKind)
                        : isDataApp
                          ? IconAppWindow
                          : IconLayoutDashboard;

                    return (
                        <Group
                            gap="xs"
                            wrap="nowrap"
                            className={classes.nameCell}
                        >
                            <Tooltip label={typeLabel}>
                                <MantineIcon
                                    icon={typeIcon}
                                    color="dimmed"
                                    className={classes.typeIcon}
                                />
                            </Tooltip>
                            <Anchor
                                component={Link}
                                to={href}
                                className={classes.nameLink}
                                underline="hover"
                            >
                                <TruncatedText
                                    maxWidth="100%"
                                    fw={500}
                                    display="block"
                                >
                                    {item.name}
                                </TruncatedText>
                            </Anchor>
                        </Group>
                    );
                },
            },
            {
                accessorKey: 'spaceName',
                header: 'Space',
                enableSorting: false,
                size: 140,
                minSize: 80,
                Cell: ({ row }) => (
                    <TruncatedText maxWidth="100%" c="ldGray.7">
                        {row.original.spaceName ?? 'My apps'}
                    </TruncatedText>
                ),
            },
            {
                accessorKey: 'verifiedBy',
                header: 'Verified By',
                enableSorting: false,
                size: 140,
                minSize: 80,
                Cell: ({ row }) => {
                    const { firstName, lastName } = row.original.verifiedBy;
                    return (
                        <TruncatedText maxWidth="100%" c="ldGray.7">
                            {`${firstName} ${lastName}`}
                        </TruncatedText>
                    );
                },
            },
            {
                accessorKey: 'verifiedAt',
                header: 'Verified At',
                enableSorting: false,
                size: 110,
                minSize: 90,
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
                header: '',
                enableSorting: false,
                size: 56,
                minSize: 48,
                Cell: ({ row }) => (
                    <Menu position="bottom-end">
                        <Menu.Target>
                            <ActionIcon
                                aria-label="Open actions"
                                onClick={(e) => {
                                    e.stopPropagation();
                                }}
                            >
                                <MantineIcon icon={IconDots} />
                            </ActionIcon>
                        </Menu.Target>
                        <Menu.Dropdown>
                            <Menu.Item
                                leftSection={<MantineIcon icon={IconCircleX} />}
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
        [handleUnverify, projectUuid],
    );

    const table = useContentTable({
        columns,
        data: items,
        enableSorting: false,
        enablePagination: false,
        enableBottomToolbar: false,
        enableTopToolbar: false,
        enableRowSelection: false,
        enableStickyHeader: true,
        state: {
            isLoading,
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
            <SettingsEmptyState
                icon={IconCircleX}
                title="No verified content"
                description="Charts, dashboards, and data apps that are verified will appear here."
            />
        );
    }

    return (
        <Stack gap="md">
            <ContentTable table={table} />

            <MantineModal
                opened={unverifyModalOpened}
                onClose={closeUnverifyModal}
                role="alertdialog"
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
