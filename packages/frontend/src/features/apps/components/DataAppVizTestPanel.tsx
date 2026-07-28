import {
    ECHARTS_DEFAULT_COLORS,
    getEffectiveOptionValues,
    getErrorMessage,
    getItemId,
    getItemMap,
    isSummaryExploreError,
    QueryExecutionContext,
    type DataAppVizContext,
    type DataAppVizOptionValue,
    type DataAppVizOptionValues,
    type DataAppVizSchema,
} from '@lightdash/common';
import { Button, Card, Group, Select, Stack, Text } from '@mantine-8/core';
import { useMantineColorScheme } from '@mantine/core';
import { useCallback, useEffect, useMemo, useState, type FC } from 'react';
import Callout from '../../../components/common/Callout';
import FieldSelect from '../../../components/common/FieldSelect';
import { PalettePicker } from '../../../components/common/PalettePicker/PalettePicker';
import DataAppVizOptionTabs from '../../../components/VisualizationConfigs/DataAppVizConfig/DataAppVizOptionTabs';
import { useColorPalettes } from '../../../hooks/appearance/useOrganizationAppearance';
import { useProjectColorPalette } from '../../../hooks/appearance/useProjectColorPalette';
import { useExploreByProjectUuid } from '../../../hooks/useExplore';
import { useExplores } from '../../../hooks/useExplores';
import { type QueryResultsProps } from '../../../hooks/useQueryResults';
import { useQueryExecutor } from '../../../providers/Explorer/useQueryExecutor';
import { getDataAppVizFieldItems } from '../utils/getDataAppVizFieldItems';
import DataAppVizFieldTypeBadge from './DataAppVizFieldTypeBadge';
import { buildTestMetricQuery, isMappingComplete } from './dataAppVizTestQuery';

type Run = { args: QueryResultsProps; mapping: Record<string, string> };

type Props = {
    projectUuid: string;
    schema: DataAppVizSchema;
    onContextChange: (ctx: DataAppVizContext | null) => void;
};

// Interactive panel below the viz result card: pick an explore, map each
// declared field to a dimension/metric, set any declared config option, run one
// query, and push the resulting context into the generator preview via
// `onContextChange`.
const DataAppVizTestPanel: FC<Props> = ({
    projectUuid,
    schema,
    onContextChange,
}) => {
    const [exploreName, setExploreName] = useState<string | null>(null);
    const [fieldMapping, setFieldMapping] = useState<Record<string, string>>(
        {},
    );
    // Only what the user explicitly changed; defaults resolve at push time.
    const [optionValues, setOptionValues] = useState<DataAppVizOptionValues>(
        {},
    );
    // Palette chosen here only for the preview — nothing is saved until the
    // viz is used on a chart, which then owns the palette the normal way.
    const [colorPaletteUuid, setColorPaletteUuid] = useState<string | null>(
        null,
    );
    // Snapshot of the query + mapping captured when the user clicks Run. Gates
    // the query so nothing fires while the user is still picking fields.
    const [run, setRun] = useState<Run | null>(null);

    const explores = useExplores(projectUuid, true);
    const explore = useExploreByProjectUuid(
        exploreName ?? undefined,
        projectUuid,
    );

    const itemsMap = useMemo(
        () => (explore.data ? getItemMap(explore.data) : {}),
        [explore.data],
    );
    const { dimensions, metrics } = useMemo(
        () => getDataAppVizFieldItems(itemsMap),
        [itemsMap],
    );

    const [{ query, queryResults }] = useQueryExecutor(
        run?.args ?? null,
        [],
        Boolean(run),
    );

    const effectiveOptions = useMemo(
        () => getEffectiveOptionValues(schema.configOptions, optionValues),
        [schema.configOptions, optionValues],
    );

    const { colorScheme } = useMantineColorScheme();
    const { data: palettes = [] } = useColorPalettes();
    const { data: projectPalette } = useProjectColorPalette(projectUuid);
    const selectedPalette = useMemo(
        () => palettes.find((p) => p.colorPaletteUuid === colorPaletteUuid),
        [palettes, colorPaletteUuid],
    );
    const colorPalette = useMemo(() => {
        const source = selectedPalette ?? projectPalette;
        if (!source) return ECHARTS_DEFAULT_COLORS;
        if (colorScheme === 'dark' && source.darkColors) {
            return source.darkColors;
        }
        return source.colors;
    }, [selectedPalette, projectPalette, colorScheme]);

    const rows = queryResults.rows;
    // Notify the parent once the run's rows arrive (external async → parent),
    // and again whenever an option changes so the preview re-renders live.
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
            onContextChange({
                fieldMapping: run.mapping,
                rows,
                options: effectiveOptions,
                colorPalette,
            });
        }
    }, [
        rows,
        run,
        runQueryUuid,
        queryResults.queryUuid,
        effectiveOptions,
        colorPalette,
        onContextChange,
    ]);
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

    const setOption = useCallback(
        (name: string, value: DataAppVizOptionValue) => {
            setOptionValues((prev) => ({ ...prev, [name]: value }));
        },
        [],
    );

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

    const generalContent = (
        <Stack gap="xs">
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
                                <DataAppVizFieldTypeBadge type={field.type} />
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
        </Stack>
    );

    return (
        <Card withBorder radius="md" p="sm">
            <Stack gap="xs">
                <Text size="sm" fw={600}>
                    Visualization ready
                </Text>

                <DataAppVizOptionTabs
                    generalContent={generalContent}
                    configOptions={schema.configOptions}
                    values={effectiveOptions}
                    onChange={setOption}
                    colorPalette={schema.colorPalette}
                    paletteControl={
                        <PalettePicker
                            label="Color palette"
                            value={colorPaletteUuid}
                            onChange={setColorPaletteUuid}
                            palettes={palettes}
                            parentLabel="Project default"
                            showPreview={false}
                        />
                    }
                />

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
