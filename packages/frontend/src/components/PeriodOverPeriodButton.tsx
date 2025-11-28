import {
    getItemId,
    isDimension,
    isSupportedPeriodOverPeriodGranularity,
    timeFrameConfigs,
    TimeFrames,
    type Dimension,
    type ItemsMap,
} from '@lightdash/common';
import {
    Badge,
    Button,
    Group,
    NumberInput,
    Popover,
    Radio,
    Select,
    Stack,
    Text,
    Tooltip,
} from '@mantine/core';
import { IconCalendarClock } from '@tabler/icons-react';
import { memo, useCallback, useMemo, useState, type FC } from 'react';
import {
    explorerActions,
    selectDimensions,
    selectPeriodOverPeriod,
    useExplorerDispatch,
    useExplorerSelector,
} from '../features/explorer/store';
import { BetaBadge } from './common/BetaBadge';
import { COLLAPSABLE_CARD_BUTTON_PROPS } from './common/CollapsableCard/constants';
import MantineIcon from './common/MantineIcon';

type Props = {
    itemsMap: ItemsMap | undefined;
    disabled: boolean;
};

// Granularity order from finest to coarsest (lower index = finer)
const GRANULARITY_ORDER: TimeFrames[] = [
    TimeFrames.DAY,
    TimeFrames.WEEK,
    TimeFrames.MONTH,
    TimeFrames.QUARTER,
    TimeFrames.YEAR,
];

const getGranularityRank = (granularity: TimeFrames): number => {
    const index = GRANULARITY_ORDER.indexOf(granularity);
    return index === -1 ? Infinity : index;
};

const PeriodOverPeriodButton: FC<Props> = memo(({ itemsMap, disabled }) => {
    const [opened, setOpened] = useState(false);
    const dispatch = useExplorerDispatch();
    const periodOverPeriod = useExplorerSelector(selectPeriodOverPeriod);
    const selectedDimensions = useExplorerSelector(selectDimensions);

    // Find all time dimensions that can be used for PoP from selected dimensions
    // Filter out coarser granularities when finer ones exist
    const availableTimeDimensions = useMemo(() => {
        if (!itemsMap || !selectedDimensions) return [];

        const allTimeDimensions = selectedDimensions
            .map((dimId) => itemsMap[dimId])
            .filter(
                (item): item is Dimension =>
                    isDimension(item) &&
                    !!item.timeInterval &&
                    isSupportedPeriodOverPeriodGranularity(item.timeInterval),
            );

        if (allTimeDimensions.length <= 1) return allTimeDimensions;

        // Find the finest granularity among all selected time dimensions
        const finestRank = Math.min(
            ...allTimeDimensions.map((dim) =>
                getGranularityRank(dim.timeInterval as TimeFrames),
            ),
        );

        // Only include dimensions that match the finest granularity
        // (exclude coarser ones like Year when Month is also selected)
        return allTimeDimensions.filter(
            (dim) =>
                getGranularityRank(dim.timeInterval as TimeFrames) ===
                finestRank,
        );
    }, [itemsMap, selectedDimensions]);

    const hasTimeDimensions = availableTimeDimensions.length > 0;

    // Track selected time dimension in popover
    const [selectedTimeDimension, setSelectedTimeDimension] = useState<
        string | null
    >(
        periodOverPeriod?.field
            ? `${periodOverPeriod.field.table}.${periodOverPeriod.field.name}`
            : null,
    );

    // Track period offset
    const [periodOffset, setPeriodOffset] = useState<number>(
        periodOverPeriod?.periodOffset ?? 1,
    );

    // Get the selected dimension object
    const selectedDimensionObj = useMemo(() => {
        if (!selectedTimeDimension || !itemsMap) return null;
        const dim = itemsMap[selectedTimeDimension];
        return isDimension(dim) ? dim : null;
    }, [selectedTimeDimension, itemsMap]);

    // Granularity is derived from the selected time dimension's timeInterval
    // For previous period comparison, it must match the dimension's granularity
    const selectedGranularity = useMemo(() => {
        if (!selectedDimensionObj?.timeInterval) return null;
        if (
            isSupportedPeriodOverPeriodGranularity(
                selectedDimensionObj.timeInterval,
            )
        ) {
            return selectedDimensionObj.timeInterval;
        }
        return null;
    }, [selectedDimensionObj]);

    // Get granularity label for selected dimension
    const granularityLabel = useMemo(() => {
        if (!selectedDimensionObj?.timeInterval) return null;
        return (
            timeFrameConfigs[selectedDimensionObj.timeInterval]?.getLabel() ||
            null
        );
    }, [selectedDimensionObj]);

    const handleApply = useCallback(() => {
        if (!selectedDimensionObj || !selectedGranularity) return;

        dispatch(
            explorerActions.setPeriodOverPeriod({
                type: 'previousPeriod',
                granularity: selectedGranularity,
                periodOffset: periodOffset,
                field: {
                    name: selectedDimensionObj.name,
                    table: selectedDimensionObj.table,
                },
            }),
        );

        // Request query execution (works regardless of auto-fetch setting)
        dispatch(explorerActions.requestQueryExecution());

        setOpened(false);
    }, [dispatch, selectedDimensionObj, selectedGranularity, periodOffset]);

    const handleClear = useCallback(() => {
        dispatch(explorerActions.setPeriodOverPeriod(undefined));
        dispatch(explorerActions.requestQueryExecution());
        setSelectedTimeDimension(null);
        setPeriodOffset(1);
        setOpened(false);
    }, [dispatch]);

    // Handle time dimension change
    const handleTimeDimensionChange = useCallback((value: string | null) => {
        setSelectedTimeDimension(value);
    }, []);

    // Reset selected dimension when popover opens
    const handleOpenChange = useCallback(
        (isOpen: boolean) => {
            setOpened(isOpen);
            if (isOpen) {
                // Set to current PoP field or first available dimension
                if (periodOverPeriod?.field) {
                    setSelectedTimeDimension(
                        `${periodOverPeriod.field.table}.${periodOverPeriod.field.name}`,
                    );
                    setPeriodOffset(periodOverPeriod.periodOffset ?? 1);
                } else if (availableTimeDimensions.length > 0) {
                    setSelectedTimeDimension(
                        getItemId(availableTimeDimensions[0]),
                    );
                    setPeriodOffset(1);
                }
            }
        },
        [periodOverPeriod, availableTimeDimensions],
    );

    const selectData = useMemo(
        () =>
            availableTimeDimensions.map((dim) => ({
                value: getItemId(dim),
                label: dim.label || dim.name,
            })),
        [availableTimeDimensions],
    );

    const buttonLabel = periodOverPeriod ? 'Period comparison' : 'Compare';

    return (
        <Popover
            opened={opened}
            onChange={handleOpenChange}
            shadow="md"
            position="bottom-end"
            withArrow
            arrowSize={10}
            offset={2}
            disabled={disabled}
        >
            <Popover.Target>
                <Tooltip
                    variant="xs"
                    label="Add a time dimension to enable period over period comparison"
                    disabled={hasTimeDimensions}
                    withinPortal
                    position="top"
                >
                    <Button
                        {...COLLAPSABLE_CARD_BUTTON_PROPS}
                        size="xs"
                        compact
                        radius="lg"
                        leftIcon={
                            <MantineIcon size="sm" icon={IconCalendarClock} />
                        }
                        display={hasTimeDimensions ? 'block' : 'none'}
                        onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                            e.stopPropagation();
                            setOpened(!opened);
                        }}
                        variant={periodOverPeriod ? 'light' : 'subtle'}
                        color={periodOverPeriod ? 'blue' : 'gray'}
                        rightIcon={<BetaBadge />}
                        styles={(theme) => ({
                            root: periodOverPeriod
                                ? {}
                                : {
                                      border: `1px dashed ${theme.colors.gray[4]}`,
                                  },
                        })}
                    >
                        {buttonLabel}{' '}
                    </Button>
                </Tooltip>
            </Popover.Target>

            <Popover.Dropdown>
                <Stack spacing="md" w={280}>
                    <Select
                        label="Time dimension"
                        placeholder="Select time dimension"
                        data={selectData}
                        value={selectedTimeDimension}
                        onChange={handleTimeDimensionChange}
                        size="xs"
                    />

                    {selectedDimensionObj && (
                        <>
                            <Radio.Group value="previousPeriod">
                                <Stack spacing="xs">
                                    <Radio
                                        value="previousPeriod"
                                        label={
                                            <Stack spacing={2}>
                                                <Text
                                                    size="sm"
                                                    fw={500}
                                                    c="gray.8"
                                                >
                                                    Previous period
                                                </Text>
                                                {granularityLabel && (
                                                    <Text
                                                        size="xs"
                                                        c="dimmed"
                                                        lh={1.5}
                                                    >
                                                        Compare each{' '}
                                                        {granularityLabel.toLowerCase()}{' '}
                                                        to the previous{' '}
                                                        {granularityLabel.toLowerCase()}
                                                    </Text>
                                                )}
                                            </Stack>
                                        }
                                        styles={{
                                            label: {
                                                cursor: 'pointer',
                                                paddingLeft: 8,
                                            },
                                            radio: {
                                                cursor: 'pointer',
                                            },
                                        }}
                                    />
                                    <Group noWrap spacing="xs" pl="28px">
                                        <NumberInput
                                            label="Period offset"
                                            placeholder="Enter offset"
                                            value={periodOffset}
                                            onChange={(value) => {
                                                if (
                                                    value !== null &&
                                                    value &&
                                                    value >= 1
                                                ) {
                                                    setPeriodOffset(value ?? 1);
                                                }
                                            }}
                                            min={1}
                                            size="xs"
                                            w={100}
                                        />

                                        <Text size="xs" fw={500} mt="md">
                                            {granularityLabel}(s)
                                        </Text>
                                    </Group>
                                    <Radio
                                        value="rolling"
                                        disabled
                                        label={
                                            <Group spacing={2}>
                                                <Text
                                                    size="sm"
                                                    fw={500}
                                                    c="dimmed"
                                                >
                                                    Rolling period
                                                </Text>
                                                <Badge size="xs" color="gray">
                                                    Coming soon
                                                </Badge>
                                            </Group>
                                        }
                                    />
                                </Stack>
                            </Radio.Group>
                        </>
                    )}

                    <Group position="apart">
                        <Button
                            size="xs"
                            variant="light"
                            color="gray"
                            onClick={handleClear}
                            sx={{
                                visibility: periodOverPeriod
                                    ? 'visible'
                                    : 'hidden',
                            }}
                        >
                            Clear
                        </Button>

                        <Button
                            size="xs"
                            onClick={handleApply}
                            disabled={
                                !selectedDimensionObj || !selectedGranularity
                            }
                        >
                            Apply
                        </Button>
                    </Group>
                </Stack>
            </Popover.Dropdown>
        </Popover>
    );
});

export default PeriodOverPeriodButton;
