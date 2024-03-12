import { subject } from '@casl/ability';
import {
    ActionIcon,
    Button,
    Card,
    Divider,
    Drawer,
    DrawerProps,
    Group,
    Popover,
    px,
    rem,
    Stack,
    Text,
    UnstyledButton,
    useMantineTheme,
} from '@mantine/core';
import { useDisclosure, useElementSize } from '@mantine/hooks';
import { IconArrowDown, IconMaximize, IconShare2 } from '@tabler/icons-react';
import { FC, memo, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { downloadCsv } from '../../../api/csv';
import { uploadGsheet } from '../../../hooks/gdrive/useGdrive';
import { useApp } from '../../../providers/AppProvider';
import {
    ExplorerSection,
    useExplorerContext,
} from '../../../providers/ExplorerProvider';
import AddColumnButton from '../../AddColumnButton';
import { Can } from '../../common/Authorization';
import {
    COLLAPSABLE_CARD_BUTTON_PROPS,
    COLLAPSABLE_CARD_POPOVER_PROPS,
} from '../../common/CollapsableCard';
import MantineIcon from '../../common/MantineIcon';
import ExportSelector from '../../ExportSelector';
import SortButton from '../../SortButton';
import { ExplorerResults } from '../ResultsCard/ExplorerResults';

const Export = () => {
    const { user } = useApp();
    const { projectUuid } = useParams<{ projectUuid: string }>();

    const metricQuery = useExplorerContext(
        (context) => context.state.unsavedChartVersion.metricQuery,
    );
    const columnOrder = useExplorerContext(
        (context) => context.state.unsavedChartVersion.tableConfig.columnOrder,
    );
    const rows = useExplorerContext(
        (context) => context.queryResults.data?.rows,
    );
    const resultsData = useExplorerContext(
        (context) => context.queryResults.data,
    );
    const tableName = useExplorerContext(
        (context) => context.state.unsavedChartVersion.tableName,
    );

    const isExportAsCsvDisabled = !resultsData || resultsData.rows.length <= 0;

    const getGsheetLink = async () => {
        const gsheetResponse = await uploadGsheet({
            projectUuid,
            exploreId: tableName,
            metricQuery,
            columnOrder,
            showTableNames: true,
        });
        return gsheetResponse;
    };

    const getCsvLink = async (csvLimit: number | null, onlyRaw: boolean) => {
        const csvResponse = await downloadCsv({
            projectUuid,
            tableId: tableName,
            query: metricQuery,
            csvLimit,
            onlyRaw,
            columnOrder,
            showTableNames: true,
        });
        return csvResponse;
    };
    return (
        <Can
            I="manage"
            this={subject('ExportCsv', {
                organizationUuid: user.data?.organizationUuid,
                projectUuid: projectUuid,
            })}
        >
            <Popover
                {...COLLAPSABLE_CARD_POPOVER_PROPS}
                disabled={isExportAsCsvDisabled}
                position="bottom-end"
            >
                <Popover.Target>
                    <Button
                        data-testid="export-csv-button"
                        {...COLLAPSABLE_CARD_BUTTON_PROPS}
                        disabled={isExportAsCsvDisabled}
                        px="xs"
                    >
                        <MantineIcon icon={IconShare2} color="gray" />
                    </Button>
                </Popover.Target>

                <Popover.Dropdown>
                    <ExportSelector
                        projectUuid={projectUuid}
                        rows={rows}
                        getCsvLink={getCsvLink}
                        getGsheetLink={getGsheetLink}
                    />
                </Popover.Dropdown>
            </Popover>
        </Can>
    );
};

export const ResultsDrawer: FC<Pick<DrawerProps, 'w'>> = memo(({ w }) => {
    const theme = useMantineTheme();

    const tableName = useExplorerContext(
        (context) => context.state.unsavedChartVersion.tableName,
    );
    const isEditMode = useExplorerContext(
        (context) => context.state.isEditMode,
    );
    const sorts = useExplorerContext(
        (context) => context.state.unsavedChartVersion.metricQuery.sorts,
    );
    const resultsData = useExplorerContext(
        (context) => context.queryResults.data,
    );
    const toggleExpandedSection = useExplorerContext(
        (context) => context.actions.toggleExpandedSection,
    );

    const hasSorts = tableName && sorts.length > 0;

    // Open by default when querying from tables and no query has been run.
    const [isDrawerInitiallyOpen, setDrawerIsInitiallyOpen] = useState(
        !tableName && isEditMode && !resultsData,
    );

    const { ref, height: headerHeight } = useElementSize<HTMLDivElement>();
    const [opened, { open, close }] = useDisclosure(isDrawerInitiallyOpen);
    const [isResizing, setIsResizing] = useState(false);
    const PAGE_CONTENT_PADDING = theme.spacing.lg;
    const INITIAL_RESULTS_DRAWER_HEIGHT_PX = 500;
    const MIN_DRAWER_HEIGHT = useMemo(
        () => headerHeight + px(theme.spacing.sm) * 2,
        [headerHeight, theme.spacing.sm],
    );
    const drawerWidth = useMemo(
        () => (w ? +w + px(PAGE_CONTENT_PADDING) * 2 + 'px' : '100%'),
        [w, PAGE_CONTENT_PADDING],
    );
    const [height, setHeight] = useState(INITIAL_RESULTS_DRAWER_HEIGHT_PX);

    useEffect(() => {
        if (isDrawerInitiallyOpen && isEditMode && resultsData) {
            setHeight(MIN_DRAWER_HEIGHT);
            setDrawerIsInitiallyOpen(false);
            toggleExpandedSection(ExplorerSection.VISUALIZATION);
        }
    }, [
        isDrawerInitiallyOpen,
        isEditMode,
        open,
        resultsData,
        close,
        toggleExpandedSection,
        MIN_DRAWER_HEIGHT,
    ]);

    const onMouseDown = () => {
        setIsResizing(true);
    };

    const onMouseUp = () => {
        setIsResizing(false);
    };

    const onMouseMove = (e: MouseEvent) => {
        if (isResizing) {
            // Calculate the distance from the bottom of the screen to the mouse cursor.
            let offsetBottom = window.innerHeight - e.clientY;

            const minHeight = MIN_DRAWER_HEIGHT; // Minimum drawer height.
            const maxHeight = 600; // Maximum drawer height.

            // Check if the new height is within bounds and update the height if it is.
            if (offsetBottom > minHeight && offsetBottom < maxHeight) {
                setHeight(offsetBottom);
            }
        }
    };

    useEffect(() => {
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);

        return () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        };
    });

    return (
        <>
            <Drawer
                withinPortal={false}
                position="bottom"
                size={height}
                opened={opened}
                onClose={close}
                withOverlay={false}
                lockScroll={false}
                withCloseButton={false}
                transitionProps={{
                    duration: 0,
                }}
                styles={{
                    inner: {
                        width: 'fill-available',
                        bottom: px(PAGE_CONTENT_PADDING),
                        margin: -px(PAGE_CONTENT_PADDING),

                        // Can't target Drawer's Paper directly
                        '& > section': {
                            width: 'fill-available',
                            position: 'absolute',
                            bottom: -px(PAGE_CONTENT_PADDING),
                            marginRight: px(PAGE_CONTENT_PADDING),
                            left: 0,
                            boxShadow: 'none',
                        },
                    },
                    body: {
                        borderTop: `1px solid ${theme.colors.gray['1']}`,
                        paddingTop: theme.spacing.xs,
                    },
                }}
            >
                <Group ref={ref} p="xs" pos="relative" position="apart">
                    <Group>
                        <Text fw={500}>Results</Text>
                        {hasSorts && (
                            <SortButton isEditMode={isEditMode} sorts={sorts} />
                        )}
                    </Group>
                    <Group>
                        <UnstyledButton
                            onMouseDown={onMouseDown}
                            h={14}
                            pos="absolute"
                            top={-8}
                            left="50%"
                            right="50%"
                            w="xl"
                            sx={{
                                cursor: 'n-resize',
                            }}
                        >
                            <Stack spacing="two">
                                <Divider
                                    sx={{
                                        borderTopWidth: '2px',
                                        borderTopColor: theme.colors.gray['5'],
                                    }}
                                />
                                <Divider
                                    sx={{
                                        borderTopWidth: rem(2),
                                        borderTopColor: theme.colors.gray['5'],
                                    }}
                                />
                            </Stack>
                        </UnstyledButton>

                        <Group>
                            {tableName && (
                                <Group position="right" spacing="xs">
                                    {isEditMode && <AddColumnButton />}
                                    <Export />
                                </Group>
                            )}
                            <ActionIcon
                                variant="default"
                                onClick={() => {
                                    close();
                                    setHeight(INITIAL_RESULTS_DRAWER_HEIGHT_PX);
                                }}
                            >
                                <MantineIcon
                                    icon={IconArrowDown}
                                    color="gray"
                                />
                            </ActionIcon>
                        </Group>
                    </Group>
                </Group>

                <ExplorerResults />
            </Drawer>
            <Card
                p="sm"
                pl="md"
                w={drawerWidth}
                radius="none"
                pos="absolute"
                bottom={PAGE_CONTENT_PADDING}
                m={-px(PAGE_CONTENT_PADDING)}
                sx={{
                    borderTop: `1px solid ${theme.colors.gray['1']}`,
                }}
            >
                <Group position="apart">
                    <Group>
                        <Text fw={500}>Results</Text>
                        {hasSorts && (
                            <SortButton isEditMode={isEditMode} sorts={sorts} />
                        )}
                    </Group>

                    <ActionIcon size="xs" onClick={open} variant="default">
                        <MantineIcon icon={IconMaximize} />
                    </ActionIcon>
                </Group>
            </Card>
        </>
    );
});
