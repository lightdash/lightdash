import {
    addComposerVizY,
    ChartKind,
    DimensionType,
    getComposerVizSort,
    removeComposerVizY,
    setComposerVizGroupBy,
    setComposerVizSort,
    setComposerVizX,
    setComposerVizY,
    type AllVizChartConfig,
    SortByDirection,
    VizAggregationOptions,
    type ComposerVizPanelOptions,
    type ResultColumn,
    type VizTableConfig,
} from '@lightdash/common';
import { ActionIcon, Group, Select, Stack, Text, Tooltip } from '@mantine/core';
import { IconMinus, IconPlus } from '@tabler/icons-react';
import capitalize from 'lodash/capitalize';
import { type FC, type ReactNode } from 'react';
import MantineIcon from '../../../../../../components/common/MantineIcon';
import { FieldReferenceSelect } from '../../../../../../components/DataViz/FieldReferenceSelect';
import fieldSelectClasses from '../../../../../../components/DataViz/FieldReferenceSelect.module.css';
import styles from './AiComposerVizConfigPanel.module.css';

type ChartConfig = Exclude<AllVizChartConfig, VizTableConfig>;

// Same options and labels as the SQL runner's sort and aggregation pills.
const NO_SORT = 'none';
const SORT_OPTIONS = [
    { value: NO_SORT, label: 'No sorting' },
    { value: SortByDirection.ASC, label: 'Ascending' },
    { value: SortByDirection.DESC, label: 'Descending' },
];
const toSortDirection = (value: string | null): SortByDirection | null =>
    Object.values(SortByDirection).find((direction) => direction === value) ??
    null;

const aggregationLabel = (aggregation: VizAggregationOptions) =>
    aggregation === VizAggregationOptions.ANY
        ? 'Any value'
        : capitalize(aggregation);
const toAggregation = (value: string | null) =>
    Object.values(VizAggregationOptions).find(
        (aggregation) => aggregation === value,
    );

const toData = (columns: ResultColumn[]) =>
    columns.map((column) => ({
        value: column.reference,
        label: column.label ?? column.reference,
    }));

/** A select beside a field select, in the same row. */
const SideSelect: FC<{
    label: string;
    data: { value: string; label: string }[];
    value: string;
    disabled: boolean;
    onChange: (value: string | null) => void;
}> = ({ label, data, value, disabled, onChange }) => (
    <Select
        aria-label={label}
        allowDeselect={false}
        disabled={disabled}
        comboboxProps={{ withinPortal: true }}
        data={data}
        value={value}
        onChange={onChange}
        w="9rem"
        flex="0 0 auto"
        classNames={{
            input: fieldSelectClasses.input,
            option: fieldSelectClasses.option,
        }}
    />
);

const Row: FC<{ title: string; action?: ReactNode; children: ReactNode }> = ({
    title,
    action,
    children,
}) => (
    <Stack gap="xs">
        <Group justify="space-between" wrap="nowrap">
            <Text fw={500} fz="sm" c="ldGray.7">
                {title}
            </Text>
            {action}
        </Group>
        {children}
    </Stack>
);

type Props = {
    value: ChartConfig;
    columns: ResultColumn[];
    options: ComposerVizPanelOptions;
    onChange: (value: AllVizChartConfig) => void;
    disabled: boolean;
};

/** X axis, Y-axis and series split rows for a chart kind; controlled on the stored viz config. */
export const AiComposerVizFieldRows: FC<Props> = ({
    value,
    columns,
    options,
    onChange,
    disabled,
}) => {
    const layout = value.fieldConfig;
    if (!layout) return null;
    const typeOf = (reference: string | undefined) =>
        columns.find((column) => column.reference === reference)?.type ??
        DimensionType.STRING;
    const isCartesian =
        value.type === ChartKind.VERTICAL_BAR || value.type === ChartKind.LINE;
    const hasX = value.type !== ChartKind.BIG_NUMBER;
    const groupBy = layout.groupBy?.[0]?.reference ?? null;
    const canAddY =
        isCartesian &&
        options.y.some(
            (column) => !layout.y.some((y) => y.reference === column.reference),
        );

    return (
        <Stack gap="md">
            {hasX && (
                <Row title="X axis">
                    <Group gap="xs" wrap="nowrap">
                        <FieldReferenceSelect
                            flex={1}
                            aria-label="X axis"
                            placeholder="Select X axis"
                            disabled={disabled}
                            allowDeselect={false}
                            comboboxProps={{ withinPortal: true }}
                            data={toData(options.x)}
                            value={layout.x?.reference ?? null}
                            onChange={(reference) =>
                                reference &&
                                onChange(
                                    setComposerVizX(value, reference, columns),
                                )
                            }
                            fieldType={typeOf(layout.x?.reference)}
                        />
                        <SideSelect
                            label="Sort"
                            data={SORT_OPTIONS}
                            value={getComposerVizSort(value) ?? NO_SORT}
                            disabled={disabled}
                            onChange={(next) =>
                                onChange(
                                    setComposerVizSort(
                                        value,
                                        toSortDirection(next),
                                    ),
                                )
                            }
                        />
                    </Group>
                </Row>
            )}
            <Row
                title="Y-axis"
                action={
                    isCartesian && (
                        <Tooltip label="Add a Y axis value" withinPortal>
                            <ActionIcon
                                size="sm"
                                variant="subtle"
                                color="gray"
                                aria-label="Add a Y axis value"
                                disabled={disabled || !canAddY}
                                onClick={() =>
                                    onChange(addComposerVizY(value, columns))
                                }
                            >
                                <MantineIcon icon={IconPlus} />
                            </ActionIcon>
                        </Tooltip>
                    )
                }
            >
                {layout.y.map((y, index) => (
                    <Group key={index} gap="xs" wrap="nowrap">
                        <FieldReferenceSelect
                            flex={1}
                            aria-label={`Y axis value ${index + 1}`}
                            placeholder="Select Y axis"
                            disabled={disabled}
                            allowDeselect={false}
                            comboboxProps={{ withinPortal: true }}
                            data={toData(options.y)}
                            value={y.reference}
                            onChange={(reference) =>
                                reference &&
                                onChange(
                                    setComposerVizY(value, index, {
                                        reference,
                                    }),
                                )
                            }
                            fieldType={typeOf(y.reference)}
                        />
                        <SideSelect
                            label={`Aggregation ${index + 1}`}
                            data={options.aggregations.map((aggregation) => ({
                                value: aggregation,
                                label: aggregationLabel(aggregation),
                            }))}
                            value={y.aggregation}
                            disabled={disabled}
                            onChange={(next) => {
                                const aggregation = toAggregation(next);
                                if (aggregation)
                                    onChange(
                                        setComposerVizY(value, index, {
                                            aggregation,
                                        }),
                                    );
                            }}
                        />
                        {layout.y.length > 1 && (
                            <Tooltip label="Remove this value" withinPortal>
                                <ActionIcon
                                    size="sm"
                                    variant="subtle"
                                    color="gray"
                                    aria-label={`Remove Y axis value ${index + 1}`}
                                    disabled={disabled}
                                    onClick={() =>
                                        onChange(
                                            removeComposerVizY(value, index),
                                        )
                                    }
                                >
                                    <MantineIcon icon={IconMinus} />
                                </ActionIcon>
                            </Tooltip>
                        )}
                    </Group>
                ))}
                {groupBy && layout.y.length > 1 && (
                    <Text size="xs" c="dimmed">
                        With a split, only the first Y axis value is charted.
                    </Text>
                )}
            </Row>
            {isCartesian && (
                <Row title="Split series by">
                    <FieldReferenceSelect
                        flex={1}
                        aria-label="Split series by"
                        placeholder="Select a column"
                        clearable
                        disabled={disabled}
                        comboboxProps={{ withinPortal: true }}
                        data={toData(options.groupBy)}
                        value={groupBy}
                        onChange={(reference) =>
                            onChange(setComposerVizGroupBy(value, reference))
                        }
                        fieldType={typeOf(groupBy ?? undefined)}
                        className={groupBy ? undefined : styles.emptySelect}
                    />
                </Row>
            )}
        </Stack>
    );
};
