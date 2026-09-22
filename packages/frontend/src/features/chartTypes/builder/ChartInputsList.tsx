import {
    getDataAppVizFieldIds,
    getItemId,
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

/** Binding the declared slots to a real run's columns. Null keeps the
 *  read-only list every sample-data session shows. */
export type ChartInputsBinding = {
    itemsMap: ItemsMap;
    fieldMapping: DataAppVizFieldMapping;
    onFieldChange: (
        fieldName: string,
        fieldId: string | string[] | null,
    ) => void;
};

type Props = {
    fields: DataAppVizField[];
    /** Query column labels each input is bound to; null when nothing real
     *  backs the preview. */
    boundLabels?: Record<string, string> | null;
    /** Real columns to bind against; null leaves the inputs read-only. */
    binding?: ChartInputsBinding | null;
};

const BindingControl: FC<{
    field: DataAppVizField;
    binding: ChartInputsBinding;
    pools: Record<'dimension' | 'metric' | 'column', Item[]>;
}> = ({ field, binding, pools }) => {
    const items = pools[poolKeyForSlot(field)];
    const value = binding.fieldMapping[field.name];
    const selectedIds = getDataAppVizFieldIds(value);

    if (field.multiple) {
        return (
            <OrderedDataAppVizFieldSelect
                header={null}
                label={field.label}
                items={items}
                selectedIds={selectedIds}
                addDisabled={items.length === 0}
                emptyPlaceholder={`This query has no ${poolKeyForSlot(field)} to bind`}
                onChange={(ids) => binding.onFieldChange(field.name, ids)}
            />
        );
    }

    return (
        <FieldSelect
            size="xs"
            aria-label={field.label}
            placeholder={
                items.length === 0
                    ? `This query has no ${poolKeyForSlot(field)} to bind`
                    : `Select ${field.label.toLowerCase()}`
            }
            disabled={items.length === 0}
            item={items.find((item) => getItemId(item) === selectedIds[0])}
            items={items}
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
}) => {
    const pools = useMemo(() => {
        const { dimensions, metrics } = getDataAppVizFieldItems(
            binding?.itemsMap ?? {},
        );
        return {
            dimension: dimensions,
            metric: metrics,
            column: [...metrics, ...dimensions],
        };
    }, [binding?.itemsMap]);

    if (fields.length === 0) return null;

    return (
        <Stack gap="xs">
            <Text component="h3" fz="sm" fw={600}>
                Chart inputs
            </Text>
            <Stack gap={6}>
                {fields.map((field) => {
                    const isUnbound =
                        binding !== null &&
                        getDataAppVizFieldIds(binding.fieldMapping[field.name])
                            .length === 0;
                    return (
                        <Box key={field.name} className={classes.field}>
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
                                <Text size="xs" c="ldGray.7" mt={2}>
                                    {boundLabels[field.name]}
                                </Text>
                            )}
                            {binding && (
                                <Box className={classes.fieldControl}>
                                    <BindingControl
                                        field={field}
                                        binding={binding}
                                        pools={pools}
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
