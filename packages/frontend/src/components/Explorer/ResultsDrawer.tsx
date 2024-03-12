import { subject } from '@casl/ability';
import {
    ActionIcon,
    Affix,
    Button,
    Divider,
    Drawer,
    Group,
    Popover,
    rem,
    UnstyledButton,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconArrowDown, IconShare2 } from '@tabler/icons-react';
import { FC, memo, useEffect, useState } from 'react';
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

export const ResultsDrawer: FC = memo(() => {
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
    const [height, setHeight] = useState(500);

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
            const minHeight = 50; // Minimum drawer height.
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
        <Affix position={{ bottom: rem(10), right: rem(20) }}>
            <Drawer
                pos="relative"
                p="xs"
                withOverlay={false}
                position="bottom"
                opened={opened}
                onClose={close}
                lockScroll={false}
                size={height}
                withCloseButton={false}
                shadow="md"
            >
                {hasSorts && (
                    <SortButton isEditMode={isEditMode} sorts={sorts} />
                )}
                <UnstyledButton onMouseDown={onMouseDown}>
                    <Divider
                        pos="absolute"
                        top="1px"
                        left="50%"
                        right="50%"
                        w="50px"
                        sx={{
                            cursor: 'n-resize',
                            borderTopWidth: rem(2),
                            borderTopColor: 'gray.5',
                        }}
                    />
                    <Divider
                        pos="absolute"
                        top="5px"
                        left="50%"
                        right="50%"
                        w="50px"
                        sx={{
                            cursor: 'n-resize',
                            borderTopColor: 'gray.5',
                            borderTopWidth: rem(2),
                        }}
                    />
                </UnstyledButton>
                <ActionIcon
                    size="xs"
                    variant="default"
                    pos="absolute"
                    top="5px"
                    right="16px"
                    onClick={close}
                >
                    <MantineIcon icon={IconArrowDown} color="gray" />
                </ActionIcon>
                {tableName && (
                    <Group position="right" spacing="xs">
                        {isEditMode && <AddColumnButton />}

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
            </Drawer>
            <Group position="center">
                <Button
                    compact
                    variant="default"
                    onClick={open}
                    disabled={!tableName}
                >
                    Results
                </Button>
            </Group>
        </Affix>
    );
});
