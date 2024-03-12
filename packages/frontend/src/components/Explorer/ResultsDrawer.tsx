import { subject } from '@casl/ability';
import {
    ActionIcon,
    Affix,
    Box,
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
import { useDisclosure } from '@mantine/hooks';
import { IconArrowDown, IconMaximize, IconShare2 } from '@tabler/icons-react';
import { FC, memo, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { downloadCsv } from '../../api/csv';
import { uploadGsheet } from '../../hooks/gdrive/useGdrive';
import { useApp } from '../../providers/AppProvider';
import { useExplorerContext } from '../../providers/ExplorerProvider';
import AddColumnButton from '../AddColumnButton';
import { Can } from '../common/Authorization';
import {
    COLLAPSABLE_CARD_BUTTON_PROPS,
    COLLAPSABLE_CARD_POPOVER_PROPS,
} from '../common/CollapsableCard';
import MantineIcon from '../common/MantineIcon';
import ExportSelector from '../ExportSelector';
import SortButton from '../SortButton';
import { ExplorerResults } from './ResultsCard/ExplorerResults';

const INTIAL_RESULTS_DRAWER_HEIGHT_PX = 500;

export const ResultsDrawer: FC<Pick<DrawerProps, 'w'>> = memo(({ w }) => {
    const theme = useMantineTheme();
    const pageContentPadding = theme.spacing.lg;
    console.log(pageContentPadding);

    const { user } = useApp();
    const { projectUuid } = useParams<{ projectUuid: string }>();

    const tableName = useExplorerContext(
        (context) => context.state.unsavedChartVersion.tableName,
    );
    const isEditMode = useExplorerContext(
        (context) => context.state.isEditMode,
    );
    const metricQuery = useExplorerContext(
        (context) => context.state.unsavedChartVersion.metricQuery,
    );
    const columnOrder = useExplorerContext(
        (context) => context.state.unsavedChartVersion.tableConfig.columnOrder,
    );
    const rows = useExplorerContext(
        (context) => context.queryResults.data?.rows,
    );
    const sorts = useExplorerContext(
        (context) => context.state.unsavedChartVersion.metricQuery.sorts,
    );
    const hasSorts = tableName && sorts.length > 0;

    const resultsData = useExplorerContext(
        (context) => context.queryResults.data,
    );
    const isExportAsCsvDisabled = !resultsData || resultsData.rows.length <= 0;

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

    const [opened, { open, close }] = useDisclosure(false);
    const [isResizing, setIsResizing] = useState(false);
    const [height, setHeight] = useState(INTIAL_RESULTS_DRAWER_HEIGHT_PX);

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
            const minHeight = 16; // Minimum drawer height.
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

    const drawerWidth = useMemo(
        () => (w ? +w + px(pageContentPadding) * 2 + 'px' : '100%'),
        [w, pageContentPadding],
    );

    return (
        <Affix position={{ bottom: rem(0), right: rem(0) }} hidden={opened}>
            <Drawer
                pos="relative"
                position="bottom"
                size={height}
                opened={opened}
                onClose={close}
                withOverlay={false}
                lockScroll={false}
                withCloseButton={false}
                styles={{
                    root: {
                        display: 'flex',
                        justifyContent: 'flex-end',
                    },
                    inner: {
                        width: drawerWidth,
                    },
                }}
            >
                <Box p="xs">
                    {hasSorts && (
                        <SortButton isEditMode={isEditMode} sorts={sorts} />
                    )}
                    <UnstyledButton
                        onMouseDown={onMouseDown}
                        h={14}
                        pos="absolute"
                        top="px"
                        left="50%"
                        right="50%"
                        w="50px"
                        sx={{
                            cursor: 'n-resize',
                        }}
                    >
                        <Stack spacing="two">
                            <Divider
                                sx={{
                                    borderTopWidth: rem(2),
                                    borderTopColor: 'gray.5',
                                }}
                            />
                            <Divider
                                sx={{
                                    borderTopWidth: rem(2),
                                    borderTopColor: 'gray.5',
                                }}
                            />
                        </Stack>
                    </UnstyledButton>
                    <ActionIcon
                        size="xs"
                        variant="default"
                        pos="absolute"
                        top="5px"
                        right="16px"
                        onClick={() => {
                            close();
                            setHeight(INTIAL_RESULTS_DRAWER_HEIGHT_PX);
                        }}
                    >
                        <MantineIcon icon={IconArrowDown} color="gray" />
                    </ActionIcon>
                    {tableName && (
                        <Group position="right" spacing="xs">
                            {isEditMode && <AddColumnButton />}

                            <Can
                                I="manage"
                                this={subject('ExportCsv', {
                                    organizationUuid:
                                        user.data?.organizationUuid,
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
                                            <MantineIcon
                                                icon={IconShare2}
                                                color="gray"
                                            />
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
                        </Group>
                    )}
                    <ExplorerResults />
                </Box>
            </Drawer>
            <Card
                p="xs"
                pl="md"
                w={drawerWidth}
                radius="none"
                sx={{
                    borderTop: `1px solid ${theme.colors.gray['1']}`,
                }}
            >
                <Group position="apart">
                    <Text fw={500}>Results</Text>

                    <ActionIcon
                        size="xs"
                        onClick={open}
                        disabled={!tableName}
                        variant="default"
                    >
                        <MantineIcon icon={IconMaximize} />
                    </ActionIcon>
                </Group>
            </Card>
        </Affix>
    );
});
