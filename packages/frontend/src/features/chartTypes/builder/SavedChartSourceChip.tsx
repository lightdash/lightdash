import { MAX_APP_VIZ_BUILD_SAMPLE_ROWS } from '@lightdash/common';
import {
    Box,
    Button,
    Group,
    Loader,
    Menu,
    Text,
    Tooltip,
    UnstyledButton,
} from '@mantine/core';
import {
    IconCheck,
    IconChartBar,
    IconEye,
    IconFlask,
    IconSwitchHorizontal,
    IconTable,
} from '@tabler/icons-react';
import { useState, type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import SavedChartPickerPopover from './SavedChartPickerPopover';
import { type SavedChartSourceControls } from './savedChartSource';
import classes from './SavedChartSourceChip.module.css';

const PREVIEW_HINT = `The preview uses this chart's query. Rows are not sent to the build; turn on “Include query rows in build” to send up to ${MAX_APP_VIZ_BUILD_SAMPLE_ROWS}.`;

type Props = {
    source: SavedChartSourceControls;
    /** Rows travel with the next prompt. Owned by the composer. */
    includeRows: boolean;
    onIncludeRowsChange: (include: boolean) => void;
    disabled: boolean;
};

/**
 * The attached saved chart in the composer tray: which chart the preview runs
 * on, whether its rows travel with the prompt, and the menu that changes both.
 */
const SavedChartSourceChip: FC<Props> = ({
    source,
    includeRows,
    onIncludeRowsChange,
    disabled,
}) => {
    const [pickerOpened, setPickerOpened] = useState(false);
    const attached = source.attached;

    if (!attached) {
        return (
            <SavedChartPickerPopover
                opened={pickerOpened}
                onOpenedChange={setPickerOpened}
                attached={null}
                onPick={source.attach}
                position="top-start"
            >
                <UnstyledButton
                    className={classes.emptyChip}
                    disabled={disabled}
                    onClick={() => setPickerOpened((opened) => !opened)}
                >
                    <MantineIcon icon={IconChartBar} size={12} />
                    <Text fz={11} fw={500} span>
                        Add saved chart
                    </Text>
                </UnstyledButton>
            </SavedChartPickerPopover>
        );
    }

    const isReady = attached.status === 'ready';
    const canIncludeRows = isReady && (attached.rowCount ?? 0) > 0;
    const rowsInBuild =
        includeRows && canIncludeRows
            ? Math.min(attached.rowCount ?? 0, MAX_APP_VIZ_BUILD_SAMPLE_ROWS)
            : 0;

    return (
        <SavedChartPickerPopover
            opened={pickerOpened}
            onOpenedChange={setPickerOpened}
            attached={null}
            onPick={source.attach}
            position="top-start"
        >
            <Box>
                <Menu position="top-start" withinPortal>
                    <Menu.Target>
                        <Tooltip
                            label={PREVIEW_HINT}
                            disabled={rowsInBuild > 0}
                            multiline
                            w={280}
                            position="top"
                        >
                            <UnstyledButton
                                className={classes.chip}
                                data-in-build={rowsInBuild > 0 || undefined}
                                disabled={disabled}
                                aria-label={`Saved chart: ${attached.chartName}`}
                            >
                                <Group
                                    className={classes.chipName}
                                    gap={4}
                                    wrap="nowrap"
                                >
                                    <MantineIcon
                                        icon={IconChartBar}
                                        size={12}
                                    />
                                    <Text
                                        fz={11}
                                        fw={500}
                                        span
                                        className={classes.chipLabel}
                                    >
                                        {attached.chartName}
                                    </Text>
                                </Group>
                                <Group
                                    className={classes.chipState}
                                    gap={4}
                                    wrap="nowrap"
                                >
                                    {attached.status === 'running' ? (
                                        <Loader size={11} />
                                    ) : (
                                        <MantineIcon
                                            icon={
                                                rowsInBuild > 0
                                                    ? IconCheck
                                                    : IconEye
                                            }
                                            size={12}
                                        />
                                    )}
                                    <Text fz={11} fw={500} span>
                                        {attached.status === 'running'
                                            ? 'Running…'
                                            : rowsInBuild > 0
                                              ? `In build · ${rowsInBuild} rows`
                                              : 'Preview'}
                                    </Text>
                                </Group>
                            </UnstyledButton>
                        </Tooltip>
                    </Menu.Target>
                    <Menu.Dropdown>
                        <Menu.Item
                            disabled={!canIncludeRows}
                            leftSection={
                                <MantineIcon
                                    icon={IconCheck}
                                    size={14}
                                    color={
                                        includeRows ? 'blue.6' : 'transparent'
                                    }
                                />
                            }
                            rightSection={
                                <Text fz={11} c="dimmed">
                                    {MAX_APP_VIZ_BUILD_SAMPLE_ROWS} max
                                </Text>
                            }
                            onClick={() => onIncludeRowsChange(!includeRows)}
                        >
                            Include query rows in build
                        </Menu.Item>
                        <Menu.Item
                            disabled={!isReady}
                            leftSection={
                                <MantineIcon icon={IconTable} size={14} />
                            }
                            onClick={source.viewRows}
                        >
                            View query results
                        </Menu.Item>
                        <Menu.Item
                            leftSection={
                                <MantineIcon
                                    icon={IconSwitchHorizontal}
                                    size={14}
                                />
                            }
                            onClick={() => setPickerOpened(true)}
                        >
                            Change saved chart…
                        </Menu.Item>
                        <Menu.Divider />
                        <Menu.Item
                            leftSection={
                                <MantineIcon icon={IconFlask} size={14} />
                            }
                            onClick={source.detach}
                        >
                            Use sample data instead
                        </Menu.Item>
                    </Menu.Dropdown>
                </Menu>
                {attached.status === 'error' && (
                    <Button
                        variant="subtle"
                        size="compact-xs"
                        onClick={source.retry}
                    >
                        Retry query
                    </Button>
                )}
            </Box>
        </SavedChartPickerPopover>
    );
};

export default SavedChartSourceChip;
