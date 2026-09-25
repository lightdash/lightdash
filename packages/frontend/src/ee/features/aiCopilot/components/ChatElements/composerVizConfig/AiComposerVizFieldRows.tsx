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
    type ComposerVizPanelOptions,
    type ComposerVizSort,
    type ResultColumn,
    type VizTableConfig,
} from '@lightdash/common';
import {
    ActionIcon,
    Group,
    Select,
    Stack,
    Text,
    Tooltip,
} from '@mantine/core';
import { IconMinus, IconPlus } from '@tabler/icons-react';
import { type FC, type ReactNode } from 'react';
import MantineIcon from '../../../../../../components/common/MantineIcon';
import { DataVizAggregationConfig } from '../../../../../../components/DataViz/config/DataVizAggregationConfig';
import pillClasses from '../../../../../../components/DataViz/config/PillSelect.module.css';
import { FieldReferenceSelect } from '../../../../../../components/DataViz/FieldReferenceSelect';

type ChartConfig = Exclude<AllVizChartConfig, VizTableConfig>;

const SORT_OPTIONS: { value: ComposerVizSort; label: string }[] = [
    { value: 'x_order', label: 'X axis order' },
    { value: 'value_desc', label: 'Value ↓' },
    { value: 'value_asc', label: 'Value ↑' },
];

const toData = (columns: ResultColumn[]) =>
    columns.map((column) => ({
        value: column.reference,
        label: column.label ?? column.reference,
    }));

const SortPill: FC<{
    value: ComposerVizSort;
    disabled: boolean;
    onChange: (sort: ComposerVizSort) => void;
}> = ({ value, disabled, onChange }) => (
    <Tooltip label="Sort" withinPortal>
        <Select
            aria-label="Sort"
            allowDeselect={false}
            disabled={disabled}
            comboboxProps={{ withinPortal: true, position: 'bottom-end' }}
            data={SORT_OPTIONS}
            value={value}
            onChange={(next) => {
                const sort = SORT_OPTIONS.find((o) => o.value === next);
                if (sort) onChange(sort.value);
            }}
            classNames={{
                option: `${pillClasses.option} ${pillClasses.grayOption}`,
                dropdown: pillClasses.dropdown,
                input: `${pillClasses.input} ${pillClasses.grayInput} ${
                    value === 'x_order' ? pillClasses.inputUnsetValue : ''
                }`,
                section: pillClasses.section,
            }}
            styles={{ input: { width: value === 'x_order' ? 96 : 68 } }}
        />
    </Tooltip>
);

const Row: FC<{ title: string; action?: ReactNode; children: ReactNode }> = ({
    title,
    action,
    children,
}) => (
    <Stack gap="xs">
        <Group justify="space-between" wrap="nowrap" mih={22}>
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
                            onChange(setComposerVizX(value, reference, columns))
                        }
                        fieldType={typeOf(layout.x?.reference)}
                        rightSection={
                            <SortPill
                                value={getComposerVizSort(value)}
                                disabled={disabled}
                                onChange={(sort) =>
                                    onChange(setComposerVizSort(value, sort))
                                }
                            />
                        }
                    />
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
                            rightSection={
                                <DataVizAggregationConfig
                                    color="gray"
                                    disabled={disabled}
                                    options={options.aggregations}
                                    aggregation={y.aggregation}
                                    onChangeAggregation={(aggregation) =>
                                        onChange(
                                            setComposerVizY(value, index, {
                                                aggregation,
                                            }),
                                        )
                                    }
                                />
                            }
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
                        styles={{
                            input: groupBy
                                ? undefined
                                : { borderStyle: 'dashed' },
                        }}
                    />
                </Row>
            )}
        </Stack>
    );
};
