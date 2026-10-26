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
    TextInput,
    ActionIcon,
    CloseButton,
    Group,
    SegmentedControl,
    Stack,
    Tooltip,
} from '@mantine/core';
import { IconRotate360 } from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useState, type FC } from 'react';
import {
    selectCartesianDirtyChartType,
    selectCartesianEditor,
    selectCartesianLayout,
    selectCartesianValidConfig,
    useVisualizationSelector,
    type VisualizationInputs,
    type VisualizationStoreState,
} from '../../../../features/visualization/store';
import {
    EMPTY_X_AXIS,
    useCartesianEditorActions,
} from '../../../../hooks/cartesianChartConfig/useCartesianChartConfig';
import FieldSelect from '../../../common/FieldSelect';
import MantineIcon from '../../../common/MantineIcon';
import { NumberInput } from '../../../common/NumberInput';
import {
    useVisualizationInputs,
    useVisualizationInputSelector,
    useVisualizationServices,
} from '../../../LightdashVisualization/useVisualizationContext';
import { AddButton } from '../../common/AddButton';
import { Config } from '../../common/Config';
import { RowLimitControls } from '../../common/RowLimitControls';
import { useAddFieldsToQuery } from '../../common/useAddFieldsToQuery';
import { MAX_PIVOTS } from '../../TableConfigPanel/constants';

type Props = {
    items: (Field | TableCalculation | CustomDimension)[];
};

// The valid layout keeps its identity across edits that leave it alone
const selectValidLayout = (
    state: VisualizationStoreState,
    inputs: VisualizationInputs,
) => selectCartesianValidConfig(state, inputs).layout;
const selectRowLimit = (state: VisualizationStoreState) =>
    selectCartesianEditor(state).rowLimit;
const selectColumnLimit = (state: VisualizationStoreState) =>
    selectCartesianEditor(state).columnLimit;

export const Layout: FC<Props> = ({ items }) => {
    const { setPivotDimensions } = useVisualizationServices();
    const { pivotDimensions } = useVisualizationInputs();
    const dirtyLayout = useVisualizationSelector(selectCartesianLayout);
    const validLayout = useVisualizationInputSelector(selectValidLayout);
    const cartesianType = useVisualizationSelector(
        selectCartesianDirtyChartType,
    );
    const rowLimit = useVisualizationSelector(selectRowLimit);
    const columnLimit = useVisualizationSelector(selectColumnLimit);
    const {
        setXField,
        setStacking,
        setFlipAxis,
        updateYField,
        removeSingleSeries,
        addSingleSeries,
        setRowLimit,
        setColumnLimit,
    } = useCartesianEditorActions();
    const { addableItems, addFieldToQuery, isFieldPending } =
        useAddFieldsToQuery();

    // Whether picking this option must first put its field on the query.
    const isAddableField = useCallback(
        (value: Field | TableCalculation | CustomDimension) =>
            !items.some((i) => getItemId(i) === getItemId(value)),
        [items],
    );

    const canBeStacked =
        cartesianType !== CartesianSeriesType.LINE &&
        cartesianType !== CartesianSeriesType.SCATTER;

    // Initialize stacking mode from saved configuration
    const initialStackMode = useMemo(() => {
        const stackValue = validLayout.stack;

        // Convert boolean format to StackType for backward compatibility
        if (stackValue === true) return StackType.NORMAL;
        if (stackValue === false) return StackType.NONE;

        // Return StackType format or default to NONE
        return stackValue || StackType.NONE;
    }, [validLayout]);

    // Track current stacking mode locally
    const [currentStackMode, setCurrentStackMode] =
        useState<string>(initialStackMode);

    // Sync local state when configuration changes (e.g., loading different saved chart)
    useEffect(() => {
        setCurrentStackMode(initialStackMode);
    }, [initialStackMode]);

    // X axis logic
    const xAxisField = useMemo(() => {
        return (
            items.find((item) => getItemId(item) === dirtyLayout?.xField) ??
            addableItems.find((item) => getItemId(item) === dirtyLayout?.xField)
        );
    }, [items, addableItems, dirtyLayout?.xField]);

    const isXAxisFieldNumeric = useMemo(
        () => isNumericItem(xAxisField),
        [xAxisField],
    );

    // Y axis logic
    const yFields = useMemo(() => dirtyLayout?.yField || [], [dirtyLayout]);

    const yActiveField = useCallback(
        (field: string) => {
            return (
                items.find((item) => getItemId(item) === field) ??
                addableItems.find((item) => getItemId(item) === field)
            );
        },
        [items, addableItems],
    );

    const availableYFields = useMemo(
        () => items.filter((item) => !yFields.includes(getItemId(item))),
        [items, yFields],
    );

    const addableYItems = useMemo(
        () => addableItems.filter((item) => !yFields.includes(getItemId(item))),
        [addableItems, yFields],
    );

    // Group series logic
    const availableDimensions = useMemo(() => {
        return items.filter(
            (item) => isDimension(item) || isCustomDimension(item),
        );
    }, [items]);

    const chartHasMetricOrTableCalc = useMemo(() => {
        const yField = validLayout.yField;

        if (!yField) return false;

        return items.some(
            (item) => !isDimension(item) && yField.includes(getItemId(item)),
        );
    }, [items, validLayout]);

    const availableGroupByDimensions = useMemo(
        () =>
            availableDimensions.filter(
                (item) =>
                    !pivotDimensions?.includes(getItemId(item)) &&
                    getItemId(item) !== dirtyLayout?.xField,
            ),
        [availableDimensions, dirtyLayout?.xField, pivotDimensions],
    );

    const addableDimensions = useMemo(
        () =>
            addableItems.filter(
                (item) => isDimension(item) || isCustomDimension(item),
            ),
        [addableItems],
    );

    const addableGroupByDimensions = useMemo(
        () =>
            addableDimensions.filter(
                (item) =>
                    !pivotDimensions?.includes(getItemId(item)) &&
                    getItemId(item) !== dirtyLayout?.xField,
            ),
        [addableDimensions, dirtyLayout?.xField, pivotDimensions],
    );

    const canAddPivot = useMemo(
        () =>
            chartHasMetricOrTableCalc &&
            availableGroupByDimensions.length +
                addableGroupByDimensions.length >
                0 &&
            (!pivotDimensions || pivotDimensions.length < MAX_PIVOTS),
        [
            availableGroupByDimensions.length,
            addableGroupByDimensions.length,
            pivotDimensions,
            chartHasMetricOrTableCalc,
        ],
    );

    const handleOnChangeOfXAxisField = useCallback(
        (newValue: Field | TableCalculation | CustomDimension | undefined) => {
            if (newValue && isAddableField(newValue)) {
                addFieldToQuery(newValue);
            }

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
        [
            setXField,
            setStacking,
            currentStackMode,
            isAddableField,
            addFieldToQuery,
        ],
    );

    const handleColumnLimitChange = (value: string | number) => {
        if (typeof value === 'number') {
            setColumnLimit(value);
        } else {
            setColumnLimit(undefined);
        }
    };

    return (
        <Stack>
            <Config>
                <Config.Section>
                    <Config.Group>
                        <Config.Heading>{`${
                            validLayout.flipAxes ? 'Y' : 'X'
                        }-axis`}</Config.Heading>
                        <Group gap="two">
                            <Tooltip label="Flip Axes">
                                <ActionIcon
                                    onClick={() =>
                                        setFlipAxis(!dirtyLayout?.flipAxes)
                                    }
                                    color="blue.4"
                                >
                                    <MantineIcon icon={IconRotate360} />
                                </ActionIcon>
                            </Tooltip>
                            {dirtyLayout?.xField === EMPTY_X_AXIS &&
                                (() => {
                                    const availableXField =
                                        items.find(
                                            (item) =>
                                                !pivotDimensions?.includes(
                                                    getItemId(item),
                                                ),
                                        ) ??
                                        addableItems.find(
                                            (item) =>
                                                !pivotDimensions?.includes(
                                                    getItemId(item),
                                                ),
                                        );
                                    return (
                                        <AddButton
                                            disabled={!availableXField}
                                            onClick={() => {
                                                if (availableXField) {
                                                    if (
                                                        isAddableField(
                                                            availableXField,
                                                        )
                                                    ) {
                                                        addFieldToQuery(
                                                            availableXField,
                                                        );
                                                    }
                                                    setXField(
                                                        getItemId(
                                                            availableXField,
                                                        ),
                                                    );
                                                }
                                            }}
                                        />
                                    );
                                })()}
                        </Group>
                    </Config.Group>
                    {dirtyLayout?.xField !== EMPTY_X_AXIS && (
                        <FieldSelect
                            data-testid="x-axis-field-select"
                            item={xAxisField}
                            items={items}
                            addItems={addableItems}
                            loading={isFieldPending(dirtyLayout?.xField)}
                            inactiveItemIds={pivotDimensions}
                            onChange={handleOnChangeOfXAxisField}
                            rightSection={
                                <CloseButton
                                    aria-label="Clear x-axis field"
                                    size="xs"
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
                            validLayout.flipAxes ? 'X' : 'Y'
                        }-axis`}</Config.Heading>
                        {(availableYFields.length > 0 ||
                            addableYItems.length > 0) && (
                            <AddButton
                                onClick={() => {
                                    const nextYField =
                                        availableYFields[0] ?? addableYItems[0];
                                    if (!nextYField) return;
                                    if (isAddableField(nextYField)) {
                                        addFieldToQuery(nextYField);
                                    }
                                    addSingleSeries(getItemId(nextYField));
                                }}
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
                                addItems={addableYItems}
                                loading={isFieldPending(field)}
                                onChange={(newValue) => {
                                    if (newValue && isAddableField(newValue)) {
                                        addFieldToQuery(newValue);
                                    }
                                    updateYField(
                                        index,
                                        newValue ? getItemId(newValue) : '',
                                    );
                                }}
                                rightSection={
                                    yFields?.length !== 1 && (
                                        <CloseButton
                                            aria-label="Remove y-axis field"
                                            size="xs"
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
                    <Stack gap="xs">
                        <Config.Group>
                            <Group gap="one">
                                <Config.Heading>Group</Config.Heading>
                            </Group>
                            {canAddPivot && (
                                <AddButton
                                    onClick={() => {
                                        const nextGroupField =
                                            availableGroupByDimensions[0] ??
                                            addableGroupByDimensions[0];
                                        if (!nextGroupField) return;
                                        if (isAddableField(nextGroupField)) {
                                            addFieldToQuery(nextGroupField);
                                        }
                                        setPivotDimensions([
                                            ...(pivotDimensions || []),
                                            getItemId(nextGroupField),
                                        ]);
                                    }}
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

                    <Stack gap="xs">
                        {pivotDimensions &&
                            pivotDimensions.map((pivotKey) => {
                                // Group series logic
                                const groupSelectedField =
                                    availableDimensions.find(
                                        (item) => getItemId(item) === pivotKey,
                                    ) ??
                                    addableDimensions.find(
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
                                            size="xs"
                                            key={pivotKey}
                                            readOnly
                                            value={pivotKey}
                                            rightSectionPointerEvents="all"
                                            rightSection={
                                                <CloseButton
                                                    onMouseDown={(event) =>
                                                        event.preventDefault()
                                                    }
                                                    aria-label="Remove pivot dimension"
                                                    size="xs"
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
                                    <Group gap="xs" key={pivotKey}>
                                        <FieldSelect
                                            disabled={
                                                !chartHasMetricOrTableCalc
                                            }
                                            placeholder="Select a field to group by"
                                            item={activeField}
                                            items={availableDimensions}
                                            addItems={addableDimensions}
                                            loading={isFieldPending(pivotKey)}
                                            inactiveItemIds={inactiveItemIds.filter(
                                                (id) => id !== pivotKey,
                                            )} // keep current value enabled
                                            onChange={(newValue) => {
                                                if (!newValue) return;
                                                if (isAddableField(newValue)) {
                                                    addFieldToQuery(newValue);
                                                }
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
                                                        aria-label="Remove pivot dimension"
                                                        size="xs"
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
                            label="x-axis must be non-numeric to enable stacking"
                            position="top-start"
                            disabled={!isXAxisFieldNumeric}
                        >
                            <Group gap="xs">
                                <Config.Label>Stacking</Config.Label>
                                <SegmentedControl
                                    size="xs"
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

            <Config>
                <Config.Section>
                    <Config.Heading>Data</Config.Heading>
                    <RowLimitControls
                        rowLimit={rowLimit}
                        onRowLimitChange={setRowLimit}
                    />
                </Config.Section>
            </Config>
            {pivotDimensions && pivotDimensions.length > 0 && (
                <Config>
                    <Config.Section>
                        <Config.Heading>Column limit</Config.Heading>
                        <NumberInput
                            size="xs"
                            min={1}
                            max={200}
                            step={1}
                            allowDecimal={false}
                            clampBehavior="strict"
                            placeholder="No limit"
                            value={columnLimit ?? ''}
                            onChange={handleColumnLimitChange}
                        />
                    </Config.Section>
                </Config>
            )}
        </Stack>
    );
};
