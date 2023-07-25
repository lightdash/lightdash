import {
    CartesianSeriesType,
    Field,
    getItemId,
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
import MantineIcon from '../../common/MantineIcon';
import { useVisualizationContext } from '../../LightdashVisualization/VisualizationProvider';
import { MAX_PIVOTS } from '../TableConfigPanel/GeneralSettings';
import FieldSelect from './FieldSelect';

type Props = {
    items: (Field | TableCalculation)[];
};

const FieldLayoutOptions: FC<Props> = ({ items }) => {
    const {
        cartesianConfig: {
            dirtyLayout,
            setXField,
            addSingleSeries,
            removeSingleSeries,
            updateYField,
            validCartesianConfig,
            setStacking,
            isStacked,
            setFlipAxis,
        },
        pivotDimensions,
        cartesianConfig,
        setPivotDimensions,
    } = useVisualizationContext();

    const cartesianType = cartesianConfig.dirtyChartType;

    const canBeStacked =
        cartesianType !== CartesianSeriesType.LINE &&
        cartesianType !== CartesianSeriesType.SCATTER &&
        cartesianType !== CartesianSeriesType.AREA;

    // X axis logic
    const xAxisField = items.find(
        (item) => getItemId(item) === dirtyLayout?.xField,
    );

    const isXAxisFieldNumeric = useMemo(
        () => isNumericItem(xAxisField),
        [xAxisField],
    );

    // Y axis logic
    const yFields = dirtyLayout?.yField || [];

    const yActiveField = useCallback(
        (field: string) => {
            return items.find((item) => getItemId(item) === field);
        },
        [items],
    );

    const availableYFields = useMemo(() => {
        return items.filter(
            (item) => !dirtyLayout?.yField?.includes(getItemId(item)),
        );
    }, [dirtyLayout, items]);

    // Group series logic
    const availableDimensions = useMemo(() => {
        return items.filter((item) => isDimension(item));
    }, [items]);

    const chartHasMetricOrTableCalc = useMemo(() => {
        if (!validCartesianConfig) return false;

        const {
            layout: { yField },
        } = validCartesianConfig;

        if (!yField) return false;

        return items.some(
            (item) => !isDimension(item) && yField.includes(getItemId(item)),
        );
    }, [validCartesianConfig, items]);

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
        (newValue) => {
            setXField(newValue ?? undefined);
            if (newValue && isStacked) {
                const newXAxisField = items.find(
                    (item) => getItemId(item) === newValue,
                );
                if (isNumericItem(newXAxisField)) setStacking(false);
            }
        },
        [isStacked, items, setStacking, setXField],
    );

    return (
        <>
            <Stack spacing="xs" mb="lg">
                <Group position="apart">
                    <Text fw={500} sx={{ alignSelf: 'end' }}>
                        {`${
                            validCartesianConfig?.layout.flipAxes ? 'Y' : 'X'
                        }-axis`}
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
                            selectedField={xAxisField}
                            fieldOptions={items}
                            onChange={handleOnChangeOfXAxisField}
                        />
                        <CloseButton
                            onClick={() => {
                                setXField(EMPTY_X_AXIS);
                            }}
                        />
                    </Group>
                )}
            </Stack>
            <Stack spacing="xs" mb="md">
                <Text fw={500}>
                    {`${
                        validCartesianConfig?.layout.flipAxes ? 'X' : 'Y'
                    }-axis`}
                </Text>

                {yFields.map((field, index) => {
                    const activeField = yActiveField(field);
                    const yFieldsOptions = activeField
                        ? [activeField, ...availableYFields]
                        : availableYFields;
                    return (
                        <Group spacing="xs" key={`${field}-y-axis`}>
                            <FieldSelect
                                selectedField={activeField}
                                fieldOptions={yFieldsOptions}
                                onChange={(newValue) => {
                                    updateYField(index, newValue ?? '');
                                }}
                            />
                            {yFields?.length !== 1 && (
                                <CloseButton
                                    onClick={() => {
                                        removeSingleSeries(index);
                                    }}
                                />
                            )}
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
                position="left"
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
                                        selectedField={activeField}
                                        fieldOptions={fieldOptions}
                                        disabled={!chartHasMetricOrTableCalc}
                                        placeholder="Select a field to group by"
                                        onChange={(newValue) => {
                                            if (!newValue) return;
                                            setPivotDimensions(
                                                pivotDimensions
                                                    ? replaceStringInArray(
                                                          pivotDimensions,
                                                          pivotKey,
                                                          newValue,
                                                      )
                                                    : [newValue],
                                            );
                                        }}
                                    />
                                    {groupSelectedField && (
                                        <CloseButton
                                            onClick={() => {
                                                setPivotDimensions(
                                                    pivotDimensions.filter(
                                                        (key) =>
                                                            key !== pivotKey,
                                                    ),
                                                );
                                            }}
                                        />
                                    )}
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
