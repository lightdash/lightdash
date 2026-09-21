import {
    countTotalFilterRules,
    getDataAppVizFieldIds,
    getItemId,
    getItemLabelWithoutTableName,
    type DataAppVizField,
    type DataAppVizFieldMapping,
    type ItemsMap,
    type MetricQuery,
} from '@lightdash/common';
import { Anchor, Box, Button, Group, Stack, Text } from '@mantine/core';
import { useId, useMemo, type FC } from 'react';
import FieldSelect from '../../../components/common/FieldSelect';
import DataAppVizFieldGuidance from '../../../components/VisualizationConfigs/DataAppVizConfig/DataAppVizFieldGuidance';
import OrderedDataAppVizFieldSelect from '../../../components/VisualizationConfigs/DataAppVizConfig/OrderedDataAppVizFieldSelect';
import DataAppVizFieldTypeBadge from '../components/DataAppVizFieldTypeBadge';
import { poolKeyForSlot } from '../utils/autoMapDataAppVizFields';
import {
    chartTypeFitDetail,
    chartTypeFitHeadline,
} from '../utils/chartTypePreviewFit';
import { getDataAppVizFieldItems } from '../utils/getDataAppVizFieldItems';
import classes from './ChartInputsPanel.module.css';
import { type PreviewFitState, type PreviewRunState } from './previewDataTypes';

type Props = {
    fields: DataAppVizField[];
    /** The chosen explore's columns. */
    itemsMap: ItemsMap;
    fieldMapping: DataAppVizFieldMapping;
    exploreLabel: string;
    /** Opens the data menu; null when a saved chart fixes the explore. */
    onChangeExplore: (() => void) | null;
    metricQuery: MetricQuery;
    run: PreviewRunState;
    fit: PreviewFitState;
    onSetField: (fieldName: string, fieldId: string | string[] | null) => void;
    onRun: () => void;
};

/**
 * The bound inputs beside the preview: which column feeds each chart input,
 * what the query would be, and the one control that runs it.
 */
const ChartInputsPanel: FC<Props> = ({
    fields,
    itemsMap,
    fieldMapping,
    exploreLabel,
    onChangeExplore,
    metricQuery,
    run,
    fit,
    onSetField,
    onRun,
}) => {
    const guidanceIdPrefix = useId();
    const { dimensions, metrics } = useMemo(
        () => getDataAppVizFieldItems(itemsMap),
        [itemsMap],
    );
    const itemPools = {
        dimension: dimensions,
        metric: metrics,
        column: [...metrics, ...dimensions],
    };
    const issues = fit.status === 'doesNotFit' ? fit.issues : [];
    const filterCount = countTotalFilterRules(metricQuery.filters);

    const isUnavailable = fit.status === 'unavailable';

    return (
        <Box className={classes.panel}>
            <Stack className={classes.scrollableBody} gap="xs">
                <Group justify="space-between" gap="xs" wrap="nowrap">
                    <Text fz="sm" fw={600}>
                        Explore
                    </Text>
                    <Group gap="xs" wrap="nowrap">
                        <Text fz="sm" c="dimmed" truncate>
                            {exploreLabel}
                        </Text>
                        {onChangeExplore && (
                            <Anchor
                                component="button"
                                type="button"
                                size="xs"
                                fw={500}
                                onClick={onChangeExplore}
                            >
                                Change
                            </Anchor>
                        )}
                    </Group>
                </Group>

                <Text fz="sm" fw={600}>
                    Chart inputs
                </Text>
                <Stack gap="xs">
                    {fields.map((field) => {
                        const guidanceId = field.description?.trim()
                            ? `${guidanceIdPrefix}-${field.name}`
                            : undefined;
                        const items = itemPools[poolKeyForSlot(field)];
                        const selectedValue = fieldMapping[field.name];
                        const selectedIds =
                            getDataAppVizFieldIds(selectedValue);
                        const selectedItem =
                            typeof selectedValue === 'string'
                                ? items.find(
                                      (i) => getItemId(i) === selectedValue,
                                  )
                                : undefined;
                        const issue = issues.find(
                            (candidate) => candidate.fieldName === field.name,
                        );
                        const mappedItem = issue?.mapped
                            ? itemsMap[issue.mapped.fieldId]
                            : undefined;

                        return (
                            <Stack key={field.name} gap={4}>
                                <Group gap={6} wrap="nowrap">
                                    <Text fz="xs" fw={500}>
                                        {field.label}
                                    </Text>
                                    {field.required && (
                                        <Text
                                            fz="xs"
                                            c="red"
                                            aria-label="Required"
                                        >
                                            *
                                        </Text>
                                    )}
                                    <DataAppVizFieldTypeBadge
                                        type={field.type}
                                    />
                                </Group>
                                <DataAppVizFieldGuidance
                                    field={field}
                                    id={guidanceId}
                                />
                                {field.multiple ? (
                                    <OrderedDataAppVizFieldSelect
                                        header={null}
                                        label={field.label}
                                        items={items}
                                        selectedIds={selectedIds}
                                        describedBy={guidanceId}
                                        addDisabled={items.length === 0}
                                        emptyPlaceholder={`You need at least one ${poolKeyForSlot(field)} in this explore to set this input`}
                                        onChange={(ids) =>
                                            onSetField(field.name, ids)
                                        }
                                    />
                                ) : (
                                    <FieldSelect
                                        size="xs"
                                        aria-label={field.label}
                                        aria-describedby={guidanceId}
                                        placeholder={`Select ${field.label.toLowerCase()}`}
                                        disabled={items.length === 0}
                                        item={selectedItem}
                                        items={items}
                                        onChange={(newField) =>
                                            onSetField(
                                                field.name,
                                                newField
                                                    ? getItemId(newField)
                                                    : null,
                                            )
                                        }
                                        clearable={!field.required}
                                        hasGrouping
                                    />
                                )}
                                {issue && (
                                    <Stack gap={0}>
                                        <Text fz="xs" c="red" fw={500}>
                                            {chartTypeFitHeadline(issue)}
                                        </Text>
                                        <Text fz="xs" c="dimmed" lh={1.4}>
                                            {chartTypeFitDetail(
                                                issue,
                                                mappedItem
                                                    ? getItemLabelWithoutTableName(
                                                          mappedItem,
                                                      )
                                                    : null,
                                            )}
                                        </Text>
                                    </Stack>
                                )}
                            </Stack>
                        );
                    })}
                </Stack>
            </Stack>

            <Stack className={classes.footer} gap={6}>
                <Group justify="space-between" gap="xs" wrap="nowrap">
                    <Text fz="xs" c={isUnavailable ? 'red' : 'dimmed'}>
                        {isUnavailable && fit.status === 'unavailable'
                            ? fit.message
                            : run.status === 'ready'
                              ? `Shape fits: ${run.rowCount} rows.`
                              : run.status === 'running'
                                ? 'Running…'
                                : run.status === 'error'
                                  ? 'The last run failed.'
                                  : issues.length > 0
                                    ? `${issues.length} input${issues.length === 1 ? '' : 's'} to fix.`
                                    : 'Not run yet.'}
                    </Text>
                    {run.status !== 'ready' && (
                        <Button
                            size="xs"
                            onClick={onRun}
                            loading={run.status === 'running'}
                            disabled={fit.status !== 'fits'}
                        >
                            Run query
                        </Button>
                    )}
                </Group>

                <Text fz="xs" c="dimmed">
                    {`Query · Limit ${metricQuery.limit}${
                        filterCount > 0
                            ? `, ${filterCount} filter${filterCount === 1 ? '' : 's'}`
                            : ''
                    }`}
                </Text>
            </Stack>
        </Box>
    );
};

export default ChartInputsPanel;
