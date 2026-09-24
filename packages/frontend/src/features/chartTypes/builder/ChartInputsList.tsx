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
    Combobox,
    Group,
    Stack,
    Text,
    Tooltip,
    VisuallyHidden,
} from '@mantine/core';
import { IconInfoCircle, IconSparkles } from '@tabler/icons-react';
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

/** An input ambient AI bound for the prompt, while the author keeps it. */
export type ChartInputAiPick = {
    reason: string;
    /** Labels of the other fields that would fit. */
    alsoFits: string[];
    /** The pick and its alternatives, leading the select's list. */
    suggestedItems: Item[];
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
    /** Inputs whose current binding ambient AI picked, by input name. */
    aiPicks: Record<string, ChartInputAiPick>;
    /** Inputs ambient AI is still picking a field for. */
    pickingFieldNames: ReadonlySet<string>;
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
    sourceHint: { text: string; isAiPicked: boolean } | null;
};

const aiPickTooltip = (pick: ChartInputAiPick) =>
    pick.alsoFits.length > 0
        ? `${pick.reason} Also fits: ${pick.alsoFits.join(', ')}.`
        : pick.reason;

const AiPickMark: FC<{ pick: ChartInputAiPick }> = ({ pick }) => (
    <Tooltip label={aiPickTooltip(pick)} position="top" multiline maw={280}>
        <Box
            component="span"
            role="img"
            tabIndex={0}
            aria-label={`Picked for your prompt. ${aiPickTooltip(pick)}`}
            className={classes.aiMark}
        >
            <MantineIcon icon={IconSparkles} size={14} color="indigo.4" />
        </Box>
    </Tooltip>
);

const BindingControl: FC<{
    field: DataAppVizField;
    binding: ChartInputsBinding;
    pools: Pools;
    addPools: Pools;
}> = ({ field, binding, pools, addPools }) => {
    const aiPick = binding.aiPicks[field.name] ?? null;
    const poolItems = pools[poolKeyForSlot(field)];
    const poolAddItems = addPools[poolKeyForSlot(field)];
    // Suggestions lead the list only from `items`, so any not yet in the
    // query move there from "Add to query".
    const liftedIds = new Set((aiPick?.suggestedItems ?? []).map(getItemId));
    const items = [
        ...poolItems,
        ...poolAddItems.filter((item) => liftedIds.has(getItemId(item))),
    ];
    const addItems = poolAddItems.filter(
        (item) => !liftedIds.has(getItemId(item)),
    );
    const hasNoItems = items.length === 0 && addItems.length === 0;
    const value = binding.fieldMapping[field.name];
    const selectedIds = getDataAppVizFieldIds(value);
    const addToQuery = binding.addToQuery;

    if (binding.pickingFieldNames.has(field.name)) {
        return (
            <FieldSelect
                size="xs"
                aria-label={field.label}
                placeholder="Picking a field"
                disabled
                loading
                items={[]}
                onChange={() => undefined}
            />
        );
    }

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

    const isClearable = !field.required;
    const aiRightSection = aiPick
        ? {
              rightSection: (
                  <Group gap={2} wrap="nowrap">
                      <AiPickMark pick={aiPick} />
                      <Combobox.Chevron size="xs" />
                  </Group>
              ),
              rightSectionWidth: isClearable && selectedIds[0] ? 64 : 44,
              rightSectionPointerEvents: isClearable
                  ? ('all' as const)
                  : ('none' as const),
          }
        : {};

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
            suggestedItems={aiPick?.suggestedItems}
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
            clearable={isClearable}
            hasGrouping
            {...aiRightSection}
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
                    <Group gap={4} wrap="nowrap" align="flex-start">
                        {sourceHint.isAiPicked && (
                            <MantineIcon
                                icon={IconSparkles}
                                size={13}
                                color="indigo.4"
                                className={classes.hintIcon}
                            />
                        )}
                        <Text fz="xs" c="dimmed">
                            {sourceHint.text}
                        </Text>
                    </Group>
                )}
            </Stack>
            <Stack gap="sm">
                {fields.map((field) => {
                    const isUnbound =
                        binding !== null &&
                        !binding.pickingFieldNames.has(field.name) &&
                        getDataAppVizFieldIds(binding.fieldMapping[field.name])
                            .length === 0;
                    const multipleAiPick = field.multiple
                        ? (binding?.aiPicks[field.name] ?? null)
                        : null;
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
                                    {multipleAiPick && (
                                        <AiPickMark pick={multipleAiPick} />
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
