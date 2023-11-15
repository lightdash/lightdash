import {
    CartesianSeriesType,
    CustomDimension,
    Field,
    getItemId,
    isCustomDimension,
    isDimension,
    isNumericItem,
    replaceStringInArray,
    TableCalculation,
} from '@lightdash/common';
import {
    Button,
    CloseButton,
    Group,
    SegmentedControl,
    Stack,
    Text,
    Tooltip,
} from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { FC, useCallback, useMemo } from 'react';
import { EMPTY_X_AXIS } from '../../../hooks/cartesianChartConfig/useCartesianChartConfig';
import FieldSelect from '../../common/FieldSelect';
import MantineIcon from '../../common/MantineIcon';
import { isCartesianVisualizationConfig } from '../../LightdashVisualization/VisualizationConfigCartesian';
import { useVisualizationContext } from '../../LightdashVisualization/VisualizationProvider';
import { MAX_PIVOTS } from '../TableConfigPanel/GeneralSettings';

type Props = {
    items: (Field | TableCalculation | CustomDimension)[];
};

const FieldLayoutOptions: FC<Props> = ({ items }) => {
    const { visualizationConfig, pivotDimensions, setPivotDimensions } =
        useVisualizationContext();

    const isCartesianChart =
        isCartesianVisualizationConfig(visualizationConfig);

    const cartesianType = isCartesianChart
        ? visualizationConfig.chartConfig.dirtyChartType
        : undefined;

    const canBeStacked =
        cartesianType !== CartesianSeriesType.LINE &&
        cartesianType !== CartesianSeriesType.SCATTER &&
        cartesianType !== CartesianSeriesType.AREA;

    // X axis logic
    const xAxisField = useMemo(() => {
        if (!isCartesianChart) return undefined;
        const { dirtyLayout } = visualizationConfig.chartConfig;

        return items.find((item) => getItemId(item) === dirtyLayout?.xField);
    }, [items, isCartesianChart, visualizationConfig]);

    const isXAxisFieldNumeric = useMemo(
        () => isNumericItem(xAxisField),
        [xAxisField],
    );

    // Y axis logic
    const yFields = useMemo(() => {
        if (!isCartesianChart) return [];
        const { dirtyLayout } = visualizationConfig.chartConfig;

        return dirtyLayout?.yField || [];
    }, [isCartesianChart, visualizationConfig]);

    const yActiveField = useCallback(
        (field: string) => {
            return items.find((item) => getItemId(item) === field);
        },
        [items],
    );

    const availableYFields = useMemo(() => {
        if (!isCartesianChart) return [];

        const { dirtyLayout } = visualizationConfig.chartConfig;

        return items.filter(
            (item) => !dirtyLayout?.yField?.includes(getItemId(item)),
        );
    }, [isCartesianChart, items, visualizationConfig]);

    // Group series logic
    const availableDimensions = useMemo(() => {
        return items.filter(
            (item) => isDimension(item) || isCustomDimension(item),
        );
    }, [items]);

    const chartHasMetricOrTableCalc = useMemo(() => {
        if (!isCartesianChart) return false;

        const { validConfig } = visualizationConfig.chartConfig;

        const yField = validConfig?.layout.yField;

        if (!yField) return false;

        return items.some(
            (item) => !isDimension(item) && yField.includes(getItemId(item)),
        );
    }, [isCartesianChart, items, visualizationConfig]);

    const availableGroupByDimensions = useMemo(
        () =>
            availableDimensions.filter(
                (item) => !pivotDimensions?.includes(getItemId(item)),
            ),
        [availableDimensions, pivotDimensions],
    );

    const canAddPivot = useMemo(
        () =>
            chartHasMetricOrTableCalc &&
            availableGroupByDimensions.length > 0 &&
            (!pivotDimensions || pivotDimensions.length < MAX_PIVOTS),
        [
            availableGroupByDimensions.length,
            pivotDimensions,
            chartHasMetricOrTableCalc,
        ],
    );

    const handleOnChangeOfXAxisField = useCallback(
        (newValue: Field | TableCalculation | CustomDimension | undefined) => {
            if (!isCartesianChart) return;
            const { setXField, setStacking, isStacked } =
                visualizationConfig.chartConfig;

            const fieldId = newValue ? getItemId(newValue) : undefined;
            setXField(fieldId ?? undefined);

            if (newValue && isStacked && isNumericItem(newValue)) {
                setStacking(false);
            }
        },
        [isCartesianChart, visualizationConfig],
    );

    if (!isCartesianChart) return null;

    const {
        validConfig,
        dirtyLayout,
        setXField,
        setFlipAxis,
        setStacking,
        isStacked,
        updateYField,
        removeSingleSeries,
        addSingleSeries,
    } = visualizationConfig.chartConfig;

    return (
        <>
            <Stack spacing="xs" mb="lg">
                <Group position="apart">
                    <Text fw={500} sx={{ alignSelf: 'end' }}>
                        {`${validConfig?.layout.flipAxes ? 'Y' : 'X'}-axis`}
                    </Text>
                    <Button
                        variant="subtle"
                        compact
                        onClick={() => setFlipAxis(!dirtyLayout?.flipAxes)}
                    >
                        Flip axes
                    </Button>
                </Group>
                {dirtyLayout?.xField === EMPTY_X_AXIS ? (
                    <Button
                        variant="subtle"
                        compact
                        sx={{
                            alignSelf: 'start',
                        }}
                        leftIcon={<MantineIcon icon={IconPlus} />}
                        onClick={() => setXField(getItemId(items[0]))}
                    >
                        Add
                    </Button>
                ) : (
                    <Group spacing="xs">
                        <FieldSelect
                            item={xAxisField}
                            items={items}
                            onChange={handleOnChangeOfXAxisField}
                            rightSection={
                                <CloseButton
                                    onClick={() => {
                                        setXField(EMPTY_X_AXIS);
                                    }}
                                />
                            }
                        />
                    </Group>
                )}
            </Stack>
            <Stack spacing="xs" mb="md">
                <Text fw={500}>
                    {`${validConfig?.layout.flipAxes ? 'X' : 'Y'}-axis`}
                </Text>

                {yFields.map((field, index) => {
                    const activeField = yActiveField(field);
                    const yFieldsOptions = activeField
                        ? [activeField, ...availableYFields]
                        : availableYFields;
                    return (
                        <Group spacing="xs" key={`${field}-y-axis`}>
                            <FieldSelect
                                item={activeField}
                                items={yFieldsOptions}
                                onChange={(newValue) => {
                                    updateYField(
                                        index,
                                        newValue ? getItemId(newValue) : '',
                                    );
                                }}
                                rightSection={
                                    yFields?.length !== 1 && (
                                        <CloseButton
                                            onClick={() => {
                                                removeSingleSeries(index);
                                            }}
                                        />
                                    )
                                }
                            />
                        </Group>
                    );
                })}
                {availableYFields.length > 0 && (
                    <Button
                        variant="subtle"
                        compact
                        sx={{
                            alignSelf: 'start',
                        }}
                        leftIcon={<MantineIcon icon={IconPlus} />}
                        onClick={() =>
                            addSingleSeries(getItemId(availableYFields[0]))
                        }
                    >
                        Add
                    </Button>
                )}
            </Stack>

            <Tooltip
                label="You need at least one metric in your chart to add a group"
                position="top-start"
                withinPortal
                disabled={chartHasMetricOrTableCalc}
            >
                <Stack spacing="xs" mb="md">
                    <Text fw={500}>Group</Text>
                    {pivotDimensions &&
                        pivotDimensions.map((pivotKey) => {
                            // Group series logic
                            const groupSelectedField = availableDimensions.find(
                                (item) => getItemId(item) === pivotKey,
                            );
                            const fieldOptions = groupSelectedField
                                ? [
                                      groupSelectedField,
                                      ...availableGroupByDimensions,
                                  ]
                                : availableGroupByDimensions;
                            const activeField = chartHasMetricOrTableCalc
                                ? groupSelectedField
                                : undefined;
                            return (
                                <Group spacing="xs" key={pivotKey}>
                                    <FieldSelect
                                        disabled={!chartHasMetricOrTableCalc}
                                        placeholder="Select a field to group by"
                                        item={activeField}
                                        items={fieldOptions}
                                        onChange={(newValue) => {
                                            if (!newValue) return;
                                            setPivotDimensions(
                                                pivotDimensions
                                                    ? replaceStringInArray(
                                                          pivotDimensions,
                                                          pivotKey,
                                                          getItemId(newValue),
                                                      )
                                                    : [getItemId(newValue)],
                                            );
                                        }}
                                        rightSection={
                                            groupSelectedField && (
                                                <CloseButton
                                                    onClick={() => {
                                                        setPivotDimensions(
                                                            pivotDimensions.filter(
                                                                (key) =>
                                                                    key !==
                                                                    pivotKey,
                                                            ),
                                                        );
                                                    }}
                                                />
                                            )
                                        }
                                    />
                                </Group>
                            );
                        })}
                    {canAddPivot && (
                        <Button
                            variant="subtle"
                            compact
                            sx={{
                                alignSelf: 'start',
                            }}
                            leftIcon={<MantineIcon icon={IconPlus} />}
                            onClick={() =>
                                setPivotDimensions([
                                    ...(pivotDimensions || []),
                                    getItemId(availableGroupByDimensions[0]),
                                ])
                            }
                        >
                            Add
                        </Button>
                    )}
                </Stack>
            </Tooltip>

            {pivotDimensions && pivotDimensions.length > 0 && canBeStacked && (
                <Tooltip
                    label="x-axis must be non-numeric to enable stacking"
                    withinPortal
                    position="top-start"
                    disabled={!isXAxisFieldNumeric}
                >
                    <Stack spacing="xs">
                        <Text fw={500}>Stacking</Text>
                        <SegmentedControl
                            disabled={isXAxisFieldNumeric}
                            fullWidth
                            color="blue"
                            value={isStacked ? 'stack' : 'noStacking'}
                            onChange={(value) => setStacking(value === 'stack')}
                            data={[
                                { label: 'No stacking', value: 'noStacking' },
                                { label: 'Stack', value: 'stack' },
                            ]}
                        />
                    </Stack>
                </Tooltip>
            )}
        </>
    );
};

export default FieldLayoutOptions;
