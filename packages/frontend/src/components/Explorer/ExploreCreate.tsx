import {
    convertQueryResultsToFields,
    CUSTOM_EXPLORE_ALIAS_NAME,
    getMetricQueryFromResults,
} from '@lightdash/common';
import { Button, Group, Stack } from '@mantine/core';
import { IconHammer, IconPlayerPlay } from '@tabler/icons-react';
import { FC, useCallback, useEffect, useMemo, useState } from 'react';
import { useHistory, useParams } from 'react-router-dom';
import useToaster from '../../hooks/toaster/useToaster';
import { useProjectCatalog } from '../../hooks/useProjectCatalog';
import { useSqlQueryMutation } from '../../hooks/useSqlQuery';
import { useCustomExplore } from '../../providers/CustomExploreProvider';
import {
    ExploreMode,
    useExplorerContext,
} from '../../providers/ExplorerProvider';
import CollapsableCard from '../common/CollapsableCard';
import MantineIcon from '../common/MantineIcon';
import SqlRunnerInput from '../SqlRunner/SqlRunnerInput';
import SqlRunnerResultsTable from '../SqlRunner/SqlRunnerResultsTable';

type Props = {};

const ExploreCreate: FC<Props> = ({}) => {
    const history = useHistory();

    const { projectUuid } = useParams<{ projectUuid: string }>();

    const { sql, setSql } = useCustomExplore();

    const setMode = useExplorerContext((c) => c.actions.setMode);

    const { showToastSuccess } = useToaster();

    const setCustomExplore = useExplorerContext(
        (c) => c.actions.setCustomExplore,
    );
    const customExplore = useExplorerContext((c) => c.state.customExplore);
    const setMetricQuery = useExplorerContext((c) => c.actions.setMetricQuery);

    const { isLoading: isCatalogLoading, data: catalogData } =
        useProjectCatalog();

    const sqlQueryMutation = useSqlQueryMutation();

    const { mutateAsync, data, isLoading: isQueryLoading } = sqlQueryMutation;

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

    const resultsData = useMemo(() => {
        if (!data) return undefined;

        const dimensions = convertQueryResultsToFields(data.fields);

        return {
            metricQuery: getMetricQueryFromResults(data),
            cacheMetadata: {
                cacheHit: false,
            },
            rows: data.rows.map((row) =>
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
            },
        };
    }, [data]);

    useEffect(() => {
        if (!resultsData) return;
        setMetricQuery(resultsData.metricQuery);
    }, [resultsData, setMetricQuery]);

    const handleSubmit = useCallback(async () => {
        if (!sql) return;

        const result = await mutateAsync(sql);

        setCustomExplore(sql, result);
    }, [mutateAsync, setCustomExplore, sql]);

    const handleChartBuild = useCallback(() => {
        // TODO: don't like this approach, need to refactor
        setMode(ExploreMode.EDIT);
        history.push(`/projects/${projectUuid}/explore/build`);

        showToastSuccess({
            title: 'Successfully generated an Explore from your SQL. ',
            subtitle:
                "Your fields came from your custom SQL query. To edit them, go to the SQL tab and hit 'edit query'.",
        });
    }, [setMode, history, projectUuid, showToastSuccess]);

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
                    onClick={handleSubmit}
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
                    onSubmit={handleSubmit}
                    resultsData={resultsData}
                    fieldsMap={resultsData?.fields ?? {}}
                    sqlQueryMutation={sqlQueryMutation}
                />
            </CollapsableCard>
        </Stack>
    );
};

export default ExploreCreate;
