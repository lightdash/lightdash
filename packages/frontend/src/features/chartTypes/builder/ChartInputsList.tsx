import {
    getDataAppVizFieldIds,
    getItemId,
    isCustomDimension,
    isDimension,
    type DataAppVizField,
    type DataAppVizFieldMapping,
    type Item,
    type ItemsMap,
} from '@lightdash/common';
import {
    ActionIcon,
    Badge,
    Box,
    Group,
    Stack,
    Text,
    Tooltip,
    VisuallyHidden,
} from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';
import { useMemo, type FC } from 'react';
import FieldSelect from '../../../components/common/FieldSelect';
import MantineIcon from '../../../components/common/MantineIcon';
import OrderedDataAppVizFieldSelect from '../../../components/VisualizationConfigs/DataAppVizConfig/OrderedDataAppVizFieldSelect';
import DataAppVizFieldTypeBadge from '../components/DataAppVizFieldTypeBadge';
import { poolKeyForSlot } from '../utils/autoMapDataAppVizFields';
import { getDataAppVizFieldItems } from '../utils/getDataAppVizFieldItems';
import classes from './ChartInputsList.module.css';

/** Where the rows behind the preview come from, and how that run is going. */
export type ChartTypePreviewDataSource =
    | { kind: 'sample' }
    | { kind: 'loading'; chartName: string | null }
    | { kind: 'error'; chartName: string | null; message: string }
    | { kind: 'live'; chartName: string | null; rowCount: number };

/** Fields a source can bind beyond the ones its query returned, offered
 *  under the select's "Add to query" group. Binding one is what adds it:
 *  the source re-runs its query over the bound fields. */
export type ChartInputsAddToQuery = {
    items: Item[];
    /** A bound field whose run has not returned yet. */
    isPending: (fieldId: string) => boolean;
};

/** Binding the declared slots to a real run's columns. Null keeps the
 *  read-only list every sample-data session shows. */
export type ChartInputsBinding = {
    itemsMap: ItemsMap;
    fieldMapping: DataAppVizFieldMapping;
    onFieldChange: (
        fieldName: string,
        fieldId: string | string[] | null,
    ) => void;
    /** Null when the source's query is fixed, as a saved chart's is. */
    addToQuery: ChartInputsAddToQuery | null;
};

type Pools = Record<'dimension' | 'metric' | 'column', Item[]>;

const toPools = (dimensions: Item[], metrics: Item[]): Pools => ({
    dimension: dimensions,
    metric: metrics,
    column: [...metrics, ...dimensions],
});

type Props = {
    fields: DataAppVizField[];
    /** Query column labels each input is bound to; null when nothing real
     *  backs the preview. */
    boundLabels?: Record<string, string> | null;
    /** Real columns to bind against; null leaves the inputs read-only. */
    binding?: ChartInputsBinding | null;
    /** Where the inputs' fields come from; null on sample data. */
    sourceHint: string | null;
};

const BindingControl: FC<{
    field: DataAppVizField;
    binding: ChartInputsBinding;
    pools: Pools;
    addPools: Pools;
}> = ({ field, binding, pools, addPools }) => {
    const items = pools[poolKeyForSlot(field)];
    const addItems = addPools[poolKeyForSlot(field)];
    const hasNoItems = items.length === 0 && addItems.length === 0;
    const value = binding.fieldMapping[field.name];
    const selectedIds = getDataAppVizFieldIds(value);
    const addToQuery = binding.addToQuery;

    if (field.multiple) {
        return (
            <OrderedDataAppVizFieldSelect
                header={null}
                label={field.label}
                items={items}
                addItems={addItems}
                selectedIds={selectedIds}
                addDisabled={hasNoItems}
                addPosition="footer"
                emptyPlaceholder={`This query has no ${poolKeyForSlot(field)} to pick`}
                isFieldPending={addToQuery?.isPending}
                onChange={(ids) => binding.onFieldChange(field.name, ids)}
            />
        );
    }

    return (
        <FieldSelect
            size="xs"
            aria-label={field.label}
            placeholder={
                hasNoItems
                    ? `This query has no ${poolKeyForSlot(field)} to pick`
                    : `Select ${field.label.toLowerCase()}`
            }
            disabled={hasNoItems}
            item={[...items, ...addItems].find(
                (item) => getItemId(item) === selectedIds[0],
            )}
            items={items}
            addItems={addItems}
            loading={
                selectedIds[0] !== undefined &&
                addToQuery !== null &&
                addToQuery.isPending(selectedIds[0])
            }
            onChange={(newField) =>
                binding.onFieldChange(
                    field.name,
                    newField ? getItemId(newField) : null,
                )
            }
            clearable={!field.required}
            hasGrouping
        />
    );
};

/** The inputs the previewed version needs bound to a query. */
const ChartInputsList: FC<Props> = ({
    fields,
    boundLabels = null,
    binding = null,
    sourceHint,
}) => {
    const pools = useMemo(() => {
        const { dimensions, metrics } = getDataAppVizFieldItems(
            binding?.itemsMap ?? {},
        );
        return toPools(dimensions, metrics);
    }, [binding?.itemsMap]);
    const addItems = binding?.addToQuery?.items;
    const addPools = useMemo(() => {
        const items = addItems ?? [];
        return toPools(
            items.filter(
                (item) => isDimension(item) || isCustomDimension(item),
            ),
            items.filter(
                (item) => !isDimension(item) && !isCustomDimension(item),
            ),
        );
    }, [addItems]);

    if (fields.length === 0) return null;

    return (
        <Stack gap="xs">
            <Stack gap="xxs">
                <Text component="h3" fz="sm" fw={600}>
                    Chart inputs
                </Text>
                {sourceHint !== null && (
                    <Text fz="xs" c="dimmed">
                        {sourceHint}
                    </Text>
                )}
            </Stack>
            <Stack gap="sm">
                {fields.map((field) => {
                    const isUnbound =
                        binding !== null &&
                        getDataAppVizFieldIds(binding.fieldMapping[field.name])
                            .length === 0;
                    return (
                        <Box key={field.name}>
                            <Group
                                justify="space-between"
                                gap="xs"
                                wrap="nowrap"
                            >
                                <Group gap={4} wrap="nowrap" miw={0}>
                                    <Text
                                        className={classes.fieldLabel}
                                        fz="sm"
                                        truncate
                                    >
                                        {field.label}
                                        {field.required && (
                                            <Text
                                                component="span"
                                                c="red"
                                                aria-hidden
                                            >
                                                {' *'}
                                            </Text>
                                        )}
                                    </Text>
                                    {field.description && (
                                        <Tooltip
                                            label={field.description}
                                            multiline
                                            w={260}
                                            position="top-start"
                                        >
                                            <ActionIcon
                                                variant="subtle"
                                                color="ldGray"
                                                size="xs"
                                                aria-label={`About ${field.label}`}
                                            >
                                                <MantineIcon
                                                    icon={IconInfoCircle}
                                                    size={14}
                                                />
                                            </ActionIcon>
                                        </Tooltip>
                                    )}
                                </Group>
                                <Group gap={4} wrap="nowrap" flex="0 0 auto">
                                    {field.required && (
                                        <VisuallyHidden>
                                            Required
                                        </VisuallyHidden>
                                    )}
                                    {isUnbound && (
                                        <Badge size="xs" color="orange">
                                            not mapped
                                        </Badge>
                                    )}
                                    <DataAppVizFieldTypeBadge
                                        type={field.type}
                                    />
                                </Group>
                            </Group>
                            {boundLabels?.[field.name] && (
                                <Text size="xs" c="ldGray.7" mt="xxs">
                                    {boundLabels[field.name]}
                                </Text>
                            )}
                            {binding && (
                                <Box className={classes.fieldControl}>
                                    <BindingControl
                                        field={field}
                                        binding={binding}
                                        pools={pools}
                                        addPools={addPools}
                                    />
                                    {isUnbound && (
                                        <Text size="xs" c="dimmed" mt={4}>
                                            Preview renders without{' '}
                                            {field.label} until a field is
                                            chosen.
                                        </Text>
                                    )}
                                </Box>
                            )}
                        </Box>
                    );
                })}
            </Stack>
        </Stack>
    );
};

export default ChartInputsList;
