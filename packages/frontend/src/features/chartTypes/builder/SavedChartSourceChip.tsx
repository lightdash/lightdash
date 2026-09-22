import {
    Box,
    Button,
    Group,
    Loader,
    Menu,
    Text,
    UnstyledButton,
} from '@mantine/core';
import {
    IconChartBar,
    IconChevronDown,
    IconFlask,
    IconSwitchHorizontal,
    IconTable,
} from '@tabler/icons-react';
import { useState, type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import SavedChartPickerPopover from './SavedChartPickerPopover';
import { type SavedChartSourceControls } from './savedChartSource';
import classes from './SavedChartSourceChip.module.css';

type Props = {
    source: SavedChartSourceControls;
    disabled: boolean;
};

/**
 * The attached saved chart in the composer tray: which chart the preview runs
 * on, and the menu that inspects or swaps it. Whether its rows travel with the
 * prompt is the sample-data button's job, beside the tray.
 */
const SavedChartSourceChip: FC<Props> = ({ source, disabled }) => {
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
                        <UnstyledButton
                            className={classes.chip}
                            disabled={disabled}
                            aria-label={`Saved chart: ${attached.chartName}`}
                        >
                            <Group gap={4} wrap="nowrap" miw={0}>
                                {attached.status === 'running' ? (
                                    <Loader size={11} />
                                ) : (
                                    <MantineIcon
                                        icon={IconChartBar}
                                        size={12}
                                    />
                                )}
                                <Text
                                    fz={11}
                                    fw={500}
                                    span
                                    className={classes.chipLabel}
                                >
                                    {attached.chartName}
                                </Text>
                                <MantineIcon
                                    icon={IconChevronDown}
                                    size={11}
                                    className={classes.chipChevron}
                                />
                            </Group>
                        </UnstyledButton>
                    </Menu.Target>
                    <Menu.Dropdown>
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
                        Try again
                    </Button>
                )}
            </Box>
        </SavedChartPickerPopover>
    );
};

export default SavedChartSourceChip;
