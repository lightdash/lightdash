import {
    getErrorMessage,
    getItemId,
    getItemMap,
    isCustomDimension,
    isDimension,
    isMetric,
    isSummaryExploreError,
    isTableCalculation,
    QueryExecutionContext,
    type DataAppVizContext,
    type DataAppVizSchema,
    type Item,
} from '@lightdash/common';
import { Button, Card, Group, Select, Stack, Text } from '@mantine-8/core';
import { useEffect, useMemo, useState, type FC } from 'react';
import Callout from '../../../components/common/Callout';
import FieldSelect from '../../../components/common/FieldSelect';
import { useExploreByProjectUuid } from '../../../hooks/useExplore';
import { useExplores } from '../../../hooks/useExplores';
import { type QueryResultsProps } from '../../../hooks/useQueryResults';
import { useQueryExecutor } from '../../../providers/Explorer/useQueryExecutor';
import DataAppVizFieldTypeBadge from './DataAppVizFieldTypeBadge';
import { buildTestMetricQuery, isMappingComplete } from './dataAppVizTestQuery';

type Run = { args: QueryResultsProps; mapping: Record<string, string> };

type Props = {
    projectUuid: string;
    schema: DataAppVizSchema;
    onContextChange: (ctx: DataAppVizContext | null) => void;
};

// Interactive panel below the viz result card: pick an explore, map each
// declared field to a dimension/metric, run one query, and push the resulting
// rows into the generator preview via `onContextChange`. Fields only.
const DataAppVizTestPanel: FC<Props> = ({
    projectUuid,
    schema,
    onContextChange,
}) => {
    const [exploreName, setExploreName] = useState<string | null>(null);
    const [fieldMapping, setFieldMapping] = useState<Record<string, string>>(
        {},
    );
    // Snapshot of the query + mapping captured when the user clicks Run. Gates
    // the query so nothing fires while the user is still picking fields.
    const [run, setRun] = useState<Run | null>(null);

    const explores = useExplores(projectUuid);
    const explore = useExploreByProjectUuid(
        exploreName ?? undefined,
        projectUuid,
    );

    const itemsMap = useMemo(
        () => (explore.data ? getItemMap(explore.data) : {}),
        [explore.data],
    );
    const allItems = useMemo(() => Object.values(itemsMap), [itemsMap]);
    const dimensions = useMemo(
        () =>
            allItems.filter(
                (i) => isDimension(i as Item) || isCustomDimension(i as Item),
            ),
        [allItems],
    );
    const metrics = useMemo(
        () =>
            allItems.filter(
                (i) => isMetric(i as Item) || isTableCalculation(i as Item),
            ),
        [allItems],
    );

    const [{ query, queryResults }] = useQueryExecutor(
        run?.args ?? null,
        [],
        Boolean(run),
    );

    const rows = queryResults.rows;
    // Notify the parent once the run's rows arrive (external async → parent).
    // Only push rows belonging to this run's query — on a re-run the executor
    // transiently re-exposes the previous query's cached page before the new
    // queryUuid lands.
    const runQueryUuid = query.data?.queryUuid;
    useEffect(() => {
        if (
            run &&
            rows.length > 0 &&
            runQueryUuid &&
            queryResults.queryUuid === runQueryUuid
        ) {
            onContextChange({ fieldMapping: run.mapping, rows });
        }
    }, [rows, run, runQueryUuid, queryResults.queryUuid, onContextChange]);
    // Clear the preview when this panel unmounts (e.g. a newer version lands).
    useEffect(() => () => onContextChange(null), [onContextChange]);

    const clearRun = () => {
        setRun(null);
        onContextChange(null);
    };

    const handleExploreChange = (value: string | null) => {
        setExploreName(value);
        setFieldMapping({});
        clearRun();
    };

    const setField = (name: string, id: string | null) => {
        setFieldMapping((prev) => {
            const next = { ...prev };
            if (id) next[name] = id;
            else delete next[name];
            return next;
        });
        clearRun();
    };

    const handleRun = () => {
        if (!exploreName || !isMappingComplete(schema, fieldMapping)) return;
        setRun({
            args: {
                projectUuid,
                tableId: exploreName,
                query: buildTestMetricQuery(exploreName, schema, fieldMapping),
                context: QueryExecutionContext.DATA_APP_SAMPLE,
            },
            mapping: fieldMapping,
        });
    };

    const exploreOptions = (explores.data ?? [])
        .filter((e) => !isSummaryExploreError(e))
        .map((e) => ({ value: e.name, label: e.label }));

    const complete =
        Boolean(exploreName) && isMappingComplete(schema, fieldMapping);
    const isRunning =
        Boolean(run) && (query.isFetching || queryResults.isFetchingFirstPage);
    const error = query.error ?? queryResults.error;

    return (
        <Card withBorder radius="md" p="sm">
            <Stack gap="xs">
                <Text size="sm" fw={600}>
                    Visualization ready
                </Text>
                <Select
                    size="xs"
                    label="Test with data"
                    placeholder="Select an explore"
                    searchable
                    data={exploreOptions}
                    value={exploreName}
                    onChange={handleExploreChange}
                />

                <Stack gap="xs">
                    {schema.fields.map((field) => {
                        const items =
                            field.type === 'metric' ? metrics : dimensions;
                        const selectedId = fieldMapping[field.name];
                        const selectedItem = selectedId
                            ? items.find((i) => getItemId(i) === selectedId)
                            : undefined;
                        return (
                            <Stack key={field.name} gap={2}>
                                <Group gap="xs">
                                    <Text size="xs" fw={500}>
                                        {field.label}
                                    </Text>
                                    <DataAppVizFieldTypeBadge
                                        type={field.type}
                                    />
                                </Group>
                                {exploreName && (
                                    <FieldSelect
                                        size="xs"
                                        placeholder={`Select ${field.label.toLowerCase()}`}
                                        disabled={items.length === 0}
                                        item={selectedItem}
                                        items={items}
                                        onChange={(newField) =>
                                            setField(
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
                            </Stack>
                        );
                    })}
                </Stack>

                {error && (
                    <Callout variant="danger">{getErrorMessage(error)}</Callout>
                )}

                {exploreName && (
                    <Group justify="flex-end">
                        <Button
                            size="xs"
                            onClick={handleRun}
                            disabled={!complete || isRunning}
                            loading={isRunning}
                        >
                            Run test query
                        </Button>
                    </Group>
                )}
            </Stack>
        </Card>
    );
};

export default DataAppVizTestPanel;
