import {
    ApiQueryResults,
    convertQueryResultsToDimensions,
    convertQueryResultsToMetrics,
    CUSTOM_EXPLORE_ALIAS_NAME,
    Field,
    fieldId,
    getMetricQueryFromResults,
    isField,
} from '@lightdash/common';
import { Button, Group, Stack } from '@mantine/core';
import { useClipboard } from '@mantine/hooks';
import { IconHammer, IconLink, IconPlayerPlay } from '@tabler/icons-react';
import isEqual from 'lodash/isEqual';
import { FC, useCallback, useMemo, useState } from 'react';
import { useHistory, useParams } from 'react-router-dom';
import useToaster from '../../hooks/toaster/useToaster';
import { useProjectCatalog } from '../../hooks/useProjectCatalog';
import { useSqlQueryMutation } from '../../hooks/useSqlQuery';
import { useCustomExplore } from '../../providers/CustomExploreProvider';
import {
    ExploreMode,
    ExplorerSection,
    useExplorerContext,
} from '../../providers/ExplorerProvider';
import CollapsableCard from '../common/CollapsableCard';
import MantineIcon from '../common/MantineIcon';
import SqlRunnerInput from '../SqlRunner/SqlRunnerInput';
import SqlRunnerResultsTable from '../SqlRunner/SqlRunnerResultsTable';

type Props = {};

const ExploreCreate: FC<Props> = ({}) => {
    const history = useHistory();

    const clipboard = useClipboard();

    const { projectUuid } = useParams<{ projectUuid: string }>();

    const [resultsData, setResultsData] = useState<ApiQueryResults>();

    const { sql, setSql } = useCustomExplore();

    const setMode = useExplorerContext((c) => c.actions.setMode);

    const reset = useExplorerContext((c) => c.actions.reset);

    const { showToastSuccess } = useToaster();

    const fetchResults = useExplorerContext(
        (context) => context.actions.fetchResults,
    );
    const isValidQuery = useExplorerContext((c) => c.state.isValidQuery);
    const setCustomExplore = useExplorerContext(
        (c) => c.actions.setCustomExplore,
    );
    const customExplore = useExplorerContext((c) => c.state.customExplore);
    const metricQuery = useExplorerContext((c) => c.state.metricQuery);
    const setMetricQuery = useExplorerContext((c) => c.actions.setMetricQuery);
    const toggleActiveField = useExplorerContext(
        (c) => c.actions.toggleActiveField,
    );
    const setSectionState = useExplorerContext(
        (c) => c.actions.setSectionState,
    );

    const { isLoading: isCatalogLoading, data: catalogData } =
        useProjectCatalog();

    const sqlQueryMutation = useSqlQueryMutation();

    const { mutateAsync, isLoading: isQueryLoading } = sqlQueryMutation;

    const isLoading = isCatalogLoading || isQueryLoading;

    const [expandedCards, setExpandedCards] = useState(
        new Map([
            ['sql', true],
            ['results', true],
        ]),
    );

    const handleCardExpand = (card: string, value: boolean) => {
        setExpandedCards((prev) => new Map(prev).set(card, value));
    };

    const handleRunSql = useCallback(async () => {
        if (!sql) return;

        const result = await mutateAsync(sql);

        const dimensions = convertQueryResultsToDimensions(result.fields);
        const metrics = convertQueryResultsToMetrics(result.fields);
        const newMetricQuery = getMetricQueryFromResults(result);

        const newResultsData: ApiQueryResults = {
            metricQuery: newMetricQuery,
            cacheMetadata: {
                cacheHit: false,
            },
            rows: result.rows.map((row) =>
                Object.keys(row).reduce((acc, columnName) => {
                    const raw = row[columnName];
                    return {
                        ...acc,
                        [`${CUSTOM_EXPLORE_ALIAS_NAME}_${columnName}`]: {
                            value: {
                                raw,
                                formatted: `${raw}`,
                            },
                        },
                    };
                }, {}),
            ),
            fields: {
                ...dimensions,
                ...metrics,
            },
        };

        setResultsData(newResultsData);

        if (!isEqual(newMetricQuery, metricQuery)) {
            // TODO: this is a bit hacky, need to refactor
            reset();
            setMetricQuery(newMetricQuery);

            Object.values(dimensions).forEach((field) =>
                toggleActiveField(fieldId(field), true),
            );
            Object.values(metrics).forEach((field) =>
                toggleActiveField(fieldId(field), false),
            );
        }

        setCustomExplore(sql, result);
    }, [
        metricQuery,
        mutateAsync,
        reset,
        setCustomExplore,
        setMetricQuery,
        setResultsData,
        toggleActiveField,
        sql,
    ]);

    const handleChartBuild = useCallback(() => {
        if (isValidQuery) {
            fetchResults();
            setSectionState([
                ExplorerSection.VISUALIZATION,
                ExplorerSection.SQL,
            ]);
        }

        // TODO: don't like this approach, need to refactor
        setMode(ExploreMode.EDIT);
        history.push(`/projects/${projectUuid}/explore/build`);

        showToastSuccess({
            key: 'explore-create-success',
            title: 'Successfully generated an Explore from your SQL. ',
            subtitle:
                "Your fields came from your custom SQL query. To edit them, go to the SQL tab and hit 'edit query'.",
        });
    }, [
        setMode,
        history,
        projectUuid,
        showToastSuccess,
        isValidQuery,
        fetchResults,
        setSectionState,
    ]);

    const handleCopyLink = useCallback(() => {
        // base64 encode the sql
        const base64Sql = btoa(sql);
        clipboard.copy(
            `${window.location.origin}/projects/${projectUuid}/explore/new?query=${base64Sql}`,
        );

        showToastSuccess({
            key: 'explore-create-link-copied',
            title: 'Copied link to clipboard',
            subtitle: 'You can now share this link with your team',
        });
    }, [clipboard, projectUuid, sql, showToastSuccess]);

    const fieldsMap = useMemo(() => {
        return Object.entries(resultsData?.fields ?? {}).reduce<
            Record<string, Field>
        >(
            (acc, [id, field]) =>
                isField(field) ? { ...acc, [id]: field } : acc,
            {},
        );
    }, [resultsData]);

    // TODO: add proper loading state
    if (isCatalogLoading) {
        return null;
    }

    return (
        <Stack mt="lg" spacing="sm" sx={{ flexGrow: 1 }}>
            <Group position="right">
                <Button
                    loading={isLoading}
                    size="xs"
                    leftIcon={<MantineIcon icon={IconPlayerPlay} />}
                    onClick={handleRunSql}
                >
                    Run SQL
                </Button>

                <Button
                    disabled={isLoading || !customExplore}
                    size="xs"
                    variant="outline"
                    leftIcon={<MantineIcon icon={IconHammer} />}
                    onClick={handleChartBuild}
                >
                    Build a chart
                </Button>

                <Button
                    disabled={isLoading || !customExplore}
                    size="xs"
                    px="xs"
                    variant="outline"
                    onClick={handleCopyLink}
                >
                    <MantineIcon icon={IconLink} />
                </Button>
            </Group>

            <CollapsableCard
                title="SQL"
                isOpen={expandedCards.get('sql')}
                onToggle={(value) => handleCardExpand('sql', value)}
            >
                <SqlRunnerInput
                    sql={sql ?? ''}
                    onChange={setSql}
                    projectCatalog={catalogData}
                    isDisabled={isLoading}
                />
            </CollapsableCard>

            <CollapsableCard
                title="Results"
                isOpen={expandedCards.get('results')}
                onToggle={(value) => handleCardExpand('results', value)}
            >
                <SqlRunnerResultsTable
                    onSubmit={handleRunSql}
                    resultsData={resultsData}
                    fieldsMap={fieldsMap}
                    sqlQueryMutation={sqlQueryMutation}
                />
            </CollapsableCard>
        </Stack>
    );
};

export default ExploreCreate;
