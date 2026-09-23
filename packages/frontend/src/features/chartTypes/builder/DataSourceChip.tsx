import { assertUnreachable } from '@lightdash/common';
import { Button, Group, Loader, Text, UnstyledButton } from '@mantine/core';
import { IconChartBar, IconChevronDown, IconTable } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import classes from './DataSourceChip.module.css';
import DataSourcePicker from './DataSourcePicker';
import { exploreChipLabel, type ExploreSourceControls } from './exploreSource';
import {
    type AttachedSavedChart,
    type SavedChartSourceControls,
} from './savedChartSource';

type Props = {
    savedChartSource: SavedChartSourceControls | null;
    exploreSource: ExploreSourceControls | null;
    disabled: boolean;
};

type ChipState = {
    icon: typeof IconTable;
    label: string;
    isRunning: boolean;
    retry: (() => void) | null;
};

const savedChartLabel = (attached: AttachedSavedChart): string => {
    switch (attached.status) {
        case 'running':
            return `${attached.chartName} · running query`;
        case 'error':
            return `${attached.chartName} · query failed`;
        case 'ready': {
            const rowCount = attached.rowCount ?? 0;
            return `${attached.chartName} · ${rowCount} ${rowCount === 1 ? 'row' : 'rows'}`;
        }
        default:
            return assertUnreachable(
                attached.status,
                'Unknown saved chart source status',
            );
    }
};

/**
 * The data source in the composer tray: which table or saved chart the
 * preview runs on. The chip opens the data source picker.
 */
const DataSourceChip: FC<Props> = ({
    savedChartSource,
    exploreSource,
    disabled,
}) => {
    const [pickerOpened, setPickerOpened] = useState(false);
    if (!savedChartSource && !exploreSource) return null;

    const togglePicker = () => setPickerOpened((opened) => !opened);
    const savedChart = savedChartSource?.attached ?? null;
    const explore = exploreSource?.attached ?? null;
    const chip: ChipState | null =
        savedChart && savedChartSource
            ? {
                  icon: IconChartBar,
                  label: savedChartLabel(savedChart),
                  isRunning: savedChart.status === 'running',
                  retry:
                      savedChart.status === 'error'
                          ? savedChartSource.retry
                          : null,
              }
            : explore && exploreSource
              ? {
                    icon: IconTable,
                    label: exploreChipLabel(explore),
                    isRunning:
                        explore.isRunning || explore.status === 'loading',
                    retry:
                        explore.status === 'error' ? exploreSource.retry : null,
                }
              : null;

    return (
        <Group gap={4} wrap="nowrap" miw={0}>
            <DataSourcePicker
                opened={pickerOpened}
                onOpenedChange={setPickerOpened}
                savedChartSource={savedChartSource}
                exploreSource={exploreSource}
                position="top-start"
                width={340}
            >
                {chip ? (
                    <UnstyledButton
                        className={classes.chip}
                        disabled={disabled}
                        aria-label={`Preview data: ${chip.label}`}
                        onClick={togglePicker}
                    >
                        <Group gap={4} wrap="nowrap" miw={0}>
                            {chip.isRunning ? (
                                <Loader size={11} />
                            ) : (
                                <MantineIcon icon={chip.icon} size={12} />
                            )}
                            <Text
                                fz="xs"
                                fw={500}
                                span
                                className={classes.chipLabel}
                            >
                                {chip.label}
                            </Text>
                            <MantineIcon
                                icon={IconChevronDown}
                                size={11}
                                className={classes.chipChevron}
                            />
                        </Group>
                    </UnstyledButton>
                ) : (
                    <UnstyledButton
                        className={classes.emptyChip}
                        disabled={disabled}
                        onClick={togglePicker}
                    >
                        <MantineIcon icon={IconChartBar} size={12} />
                        <Text fz="xs" fw={500} span>
                            Add preview data
                        </Text>
                    </UnstyledButton>
                )}
            </DataSourcePicker>
            {chip?.retry && (
                <Button variant="subtle" size="compact-xs" onClick={chip.retry}>
                    Try again
                </Button>
            )}
        </Group>
    );
};

export default DataSourceChip;
