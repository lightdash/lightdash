import {
    CartesianSeriesType,
    getItemId,
    isCustomDimension,
    isDimension,
    isNumericItem,
    replaceStringInArray,
    StackType,
    type CustomDimension,
    type Field,
    type TableCalculation,
} from '@lightdash/common';
import {
    ActionIcon,
    CloseButton,
    Group,
    SegmentedControl,
    Stack,
    TextInput,
    Tooltip,
} from '@mantine/core';
import { IconRotate360 } from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useState, type FC } from 'react';
import { EMPTY_X_AXIS } from '../../../../hooks/cartesianChartConfig/useCartesianChartConfig';
import { isCartesianVisualizationConfig } from '../../../LightdashVisualization/types';
import { useVisualizationContext } from '../../../LightdashVisualization/useVisualizationContext';
import FieldSelect from '../../../common/FieldSelect';
import MantineIcon from '../../../common/MantineIcon';
import { MAX_PIVOTS } from '../../TableConfigPanel/constants';
import { AddButton } from '../../common/AddButton';
import { Config } from '../../common/Config';

type Props = {
    items: (Field | TableCalculation | CustomDimension)[];
};

export const Layout: FC<Props> = ({ items }) => {
    const { visualizationConfig, pivotDimensions, setPivotDimensions } =
        useVisualizationContext();

    const isCartesianChart =
        isCartesianVisualizationConfig(visualizationConfig);

    const cartesianType = isCartesianChart
        ? visualizationConfig.chartConfig.dirtyChartType
        : undefined;

    const canBeStacked =
        cartesianType !== CartesianSeriesType.LINE &&
        cartesianType !== CartesianSeriesType.SCATTER;

    // Initialize stacking mode from saved configuration
    const initialStackMode = useMemo(() => {
        if (!isCartesianChart) return StackType.NONE;
        const { validConfig } = visualizationConfig.chartConfig;
        const stackValue = validConfig?.layout?.stack;

        // Convert boolean format to StackType for backward compatibility
        if (stackValue === true) return StackType.NORMAL;
        if (stackValue === false) return StackType.NONE;

        // Return StackType format or default to NONE
        return stackValue || StackType.NONE;
    }, [isCartesianChart, visualizationConfig.chartConfig]);

    // Track current stacking mode locally
    const [currentStackMode, setCurrentStackMode] =
        useState<string>(initialStackMode);

    // Sync local state when configuration changes (e.g., loading different saved chart)
    useEffect(() => {
        setCurrentStackMode(initialStackMode);
    }, [initialStackMode]);

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
                (item) =>
                    !pivotDimensions?.includes(getItemId(item)) &&
                    (!isCartesianChart ||
                        getItemId(item) !==
                            visualizationConfig.chartConfig.dirtyLayout
                                ?.xField),
            ),
        [
            availableDimensions,
            visualizationConfig.chartConfig,
            isCartesianChart,
            pivotDimensions,
        ],
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
            const { setXField, setStacking } = visualizationConfig.chartConfig;

            const fieldId = newValue ? getItemId(newValue) : undefined;
            setXField(fieldId ?? undefined);

            if (
                newValue &&
                currentStackMode !== StackType.NONE &&
                isNumericItem(newValue)
            ) {
                setStacking(false);
                setCurrentStackMode(StackType.NONE);
            }
        },
        [isCartesianChart, visualizationConfig, currentStackMode],
    );

    if (!isCartesianChart) return null;

    const {
        validConfig,
        dirtyLayout,
        setXField,
        setStacking,
        setFlipAxis,
        updateYField,
        removeSingleSeries,
        addSingleSeries,
    } = visualizationConfig.chartConfig;

    return (
        <Stack>
            <Config>
                <Config.Section>
                    <Config.Group>
                        <Config.Heading>{`${
                            validConfig?.layout.flipAxes ? 'Y' : 'X'
                        }-axis`}</Config.Heading>
                        <Group spacing="two">
                            <Tooltip variant="xs" label="Flip Axes">
                                <ActionIcon
                                    onClick={() =>
                                        setFlipAxis(!dirtyLayout?.flipAxes)
                                    }
                                    color="blue.4"
                                >
                                    <MantineIcon icon={IconRotate360} />
                                </ActionIcon>
                            </Tooltip>
                            {dirtyLayout?.xField === EMPTY_X_AXIS && (
                                <AddButton
                                    onClick={() =>
                                        setXField(getItemId(items[0]))
                                    }
                                />
                            )}
                        </Group>
                    </Config.Group>
                    {dirtyLayout?.xField !== EMPTY_X_AXIS && (
                        <FieldSelect
                            data-testid="x-axis-field-select"
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
                            hasGrouping
                        />
                    )}
                </Config.Section>
            </Config>

            <Config>
                <Config.Section>
                    <Config.Group>
                        <Config.Heading>{`${
                            validConfig?.layout.flipAxes ? 'X' : 'Y'
                        }-axis`}</Config.Heading>
                        {availableYFields.length > 0 && (
                            <AddButton
                                onClick={() =>
                                    addSingleSeries(
                                        getItemId(availableYFields[0]),
                                    )
                                }
                            />
                        )}
                    </Config.Group>

                    {yFields.map((field, index) => {
                        const activeField = yActiveField(field);
                        const yFieldsOptions = activeField
                            ? [activeField, ...availableYFields]
                            : availableYFields;
                        return (
                            <FieldSelect
                                key={`${field}-y-axis`}
                                data-testid="y-axis-field-select"
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
                                hasGrouping
                            />
                        );
                    })}
                </Config.Section>
            </Config>

            <Config>
                <Config.Section>
                    <Stack spacing="xs">
                        <Config.Group>
                            <Group spacing="one">
                                <Config.Heading>Group</Config.Heading>
                            </Group>
                            {canAddPivot && (
                                <AddButton
                                    onClick={() =>
                                        setPivotDimensions([
                                            ...(pivotDimensions || []),
                                            getItemId(
                                                availableGroupByDimensions[0],
                                            ),
                                        ])
                                    }
                                />
                            )}
                        </Config.Group>
                        {!chartHasMetricOrTableCalc &&
                            !(pivotDimensions && !!pivotDimensions.length) && (
                                <FieldSelect
                                    items={[]}
                                    onChange={() => {}}
                                    disabled
                                    placeholder="You need at least one metric in your chart to add a group"
                                />
                            )}
                    </Stack>

                    <Stack spacing="xs">
                        {pivotDimensions &&
                            pivotDimensions.map((pivotKey) => {
                                // Group series logic
                                const groupSelectedField =
                                    availableDimensions.find(
                                        (item) => getItemId(item) === pivotKey,
                                    );
                                const activeField = chartHasMetricOrTableCalc
                                    ? groupSelectedField
                                    : undefined;
                                const inactiveItemIds = dirtyLayout?.xField
                                    ? [dirtyLayout.xField, ...pivotDimensions]
                                    : pivotDimensions;
                                // check if is invalid reference
                                if (!groupSelectedField) {
                                    return (
                                        <TextInput
                                            key={pivotKey}
                                            readOnly
                                            value={pivotKey}
                                            rightSection={
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
                                            }
                                            error={'Invalid reference'}
                                        />
                                    );
                                }
                                return (
                                    <Group spacing="xs" key={pivotKey}>
                                        <FieldSelect
                                            disabled={
                                                !chartHasMetricOrTableCalc
                                            }
                                            placeholder="Select a field to group by"
                                            item={activeField}
                                            items={availableDimensions}
                                            inactiveItemIds={inactiveItemIds.filter(
                                                (id) => id !== pivotKey,
                                            )} // keep current value enabled
                                            onChange={(newValue) => {
                                                if (!newValue) return;
                                                setPivotDimensions(
                                                    pivotDimensions
                                                        ? replaceStringInArray(
                                                              pivotDimensions,
                                                              pivotKey,
                                                              getItemId(
                                                                  newValue,
                                                              ),
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
                                            hasGrouping
                                        />
                                    </Group>
                                );
                            })}
                    </Stack>
                    {canBeStacked && (
                        <Tooltip
                            variant="xs"
                            label="x-axis must be non-numeric to enable stacking"
                            withinPortal
                            position="top-start"
                            disabled={!isXAxisFieldNumeric}
                        >
                            <Group spacing="xs">
                                <Config.Label>Stacking</Config.Label>
                                <SegmentedControl
                                    disabled={isXAxisFieldNumeric}
                                    value={
                                        isXAxisFieldNumeric
                                            ? StackType.NONE
                                            : currentStackMode
                                    }
                                    onChange={(value) => {
                                        setCurrentStackMode(value);
                                        setStacking(value as StackType);
                                    }}
                                    data={[
                                        {
                                            label: 'None',
                                            value: StackType.NONE,
                                        },
                                        {
                                            label: 'Stack',
                                            value: StackType.NORMAL,
                                        },
                                        {
                                            label: '100%',
                                            value: StackType.PERCENT,
                                        },
                                    ]}
                                />
                            </Group>
                        </Tooltip>
                    )}
                </Config.Section>
            </Config>
        </Stack>
    );
};
