import { subject } from '@casl/ability';
import {
    ChartType,
    convertFieldRefToFieldId,
    FilterOperator,
    getDimensions,
    getFields,
    getFiltersFromGroup,
    getItemId,
    isCustomBinDimension,
    isDimension,
    isField,
    isMetric,
    QueryExecutionContext,
    type CreateSavedChartVersion,
    type FilterRule,
    type Filters,
    type Metric,
} from '@lightdash/common';
import { Box, Button, Group, Modal, Popover, Title } from '@mantine/core';
import { useElementSize } from '@mantine/hooks';
import { IconShare2 } from '@tabler/icons-react';
import { useCallback, useMemo, type FC } from 'react';
import { useParams } from 'react-router';
import { v4 as uuidv4 } from 'uuid';
import { useExplore } from '../../hooks/useExplore';
import { getExplorerUrlFromCreateSavedChartVersion } from '../../hooks/useExplorerRoute';
import {
    getUnderlyingDataResults,
    useUnderlyingDataResults,
} from '../../hooks/useUnderlyingDataResults';
import { Can } from '../../providers/Ability';
import useApp from '../../providers/App/useApp';
import { convertDateFilters } from '../../utils/dateFilter';
import ErrorState from '../common/ErrorState';
import LinkButton from '../common/LinkButton';
import MantineIcon from '../common/MantineIcon';
import { type TableColumn } from '../common/Table/types';
import ExportResults from '../ExportResults';
import UnderlyingDataResultsTable from './UnderlyingDataResultsTable';
import { useMetricQueryDataContext } from './useMetricQueryDataContext';

interface Props {}

const UnderlyingDataModalContent: FC<Props> = () => {
    const modalContentElementSize = useElementSize();

    const modalHeaderElementSize = useElementSize();
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const { tableName, metricQuery, underlyingDataConfig, queryUuid } =
        useMetricQueryDataContext();

    const { user } = useApp();

    const { data: explore } = useExplore(tableName, { refetchOnMount: false });

    const underlyingDataItemId = useMemo(
        () =>
            underlyingDataConfig?.item !== undefined &&
            isField(underlyingDataConfig.item)
                ? getItemId(underlyingDataConfig.item)
                : undefined,
        [underlyingDataConfig?.item],
    );

    const nonBinCustomDimensions = useMemo(
        () =>
            metricQuery?.customDimensions?.filter(
                (dimension) => !isCustomBinDimension(dimension),
            ) || [],
        [metricQuery?.customDimensions],
    );

    const allFields = useMemo(
        () => [
            ...nonBinCustomDimensions,
            ...(explore ? getFields(explore) : []),
        ],
        [explore, nonBinCustomDimensions],
    );

    const allDimensions = useMemo(
        () => [
            ...nonBinCustomDimensions,
            ...(explore ? getDimensions(explore) : []),
        ],
        [explore, nonBinCustomDimensions],
    );

    const joinedTables = useMemo(
        () =>
            (explore?.joinedTables || []).map(
                (joinedTable) => joinedTable.table,
            ),
        [explore],
    );

    const showUnderlyingValues: string[] | undefined = useMemo(() => {
        return underlyingDataConfig?.item !== undefined &&
            isField(underlyingDataConfig.item) &&
            isMetric(underlyingDataConfig.item)
            ? underlyingDataConfig?.item.showUnderlyingValues
            : undefined;
    }, [underlyingDataConfig?.item]);

    const sortByUnderlyingValues = useCallback(
        (columnA: TableColumn, columnB: TableColumn) => {
            if (showUnderlyingValues === undefined) return 0;

            const indexOfUnderlyingValue = (column: TableColumn): number => {
                const columnDimension = allDimensions.find(
                    (dimension) => getItemId(dimension) === column.id,
                );
                if (columnDimension === undefined) return -1;
                return showUnderlyingValues?.indexOf(columnDimension.name) !==
                    -1
                    ? showUnderlyingValues?.indexOf(columnDimension.name)
                    : showUnderlyingValues?.indexOf(
                          `${columnDimension.table}.${columnDimension.name}`,
                      );
            };

            return (
                indexOfUnderlyingValue(columnA) -
                indexOfUnderlyingValue(columnB)
            );
        },
        [showUnderlyingValues, allDimensions],
    );

    const filters = useMemo<Filters>(() => {
        if (!underlyingDataConfig) return {};
        const { item, fieldValues, pivotReference, value } =
            underlyingDataConfig;

        if (item === undefined) return {};

        // If we are viewing data from a metric or a table calculation, we filter using all existing dimensions in the table
        const dimensionFilters = !isDimension(item)
            ? Object.entries(fieldValues).reduce((acc, r) => {
                  const [key, { raw }] = r;

                  const dimensionFilter: FilterRule = {
                      id: uuidv4(),
                      target: {
                          fieldId: key,
                      },
                      operator:
                          raw === null
                              ? FilterOperator.NULL
                              : FilterOperator.EQUALS,
                      values: raw === null ? undefined : [raw],
                  };
                  const isValidDimension = allDimensions.find(
                      (dimension) => getItemId(dimension) === key,
                  );

                  if (isValidDimension) {
                      return [...acc, dimensionFilter];
                  }
                  return acc;
              }, [] as FilterRule[])
            : [
                  {
                      id: uuidv4(),
                      target: {
                          fieldId: getItemId(item),
                      },
                      operator:
                          value.raw === null
                              ? FilterOperator.NULL
                              : FilterOperator.EQUALS,
                      values: value.raw === null ? undefined : [value.raw],
                  },
              ];

        const pivotFilter: FilterRule[] = (
            pivotReference?.pivotValues || []
        ).map((pivot) => ({
            id: uuidv4(),
            target: {
                fieldId: pivot.field,
            },
            operator:
                pivot.value === null
                    ? FilterOperator.NULL
                    : FilterOperator.EQUALS,
            values: pivot.value === null ? undefined : [pivot.value],
        }));

        const metric: Metric | undefined =
            isField(item) && isMetric(item) ? item : undefined;

        const metricFilters =
            metric?.filters?.map((filter) => ({
                ...filter,
                target: {
                    fieldId: convertFieldRefToFieldId(
                        filter.target.fieldRef,
                        metric.table,
                    ),
                },
            })) || [];

        const exploreFilters =
            metricQuery?.filters?.dimensions !== undefined
                ? [metricQuery.filters.dimensions]
                : [];

        const combinedFilters = [
            ...exploreFilters,
            ...dimensionFilters,
            ...pivotFilter,
            ...metricFilters,
        ];

        return getFiltersFromGroup(
            {
                id: uuidv4(),
                and: combinedFilters,
            },
            allFields,
        );
    }, [underlyingDataConfig, metricQuery, allFields, allDimensions]);

    const {
        error,
        data: resultsData,
        isInitialLoading,
    } = useUnderlyingDataResults(
        filters,
        queryUuid,
        underlyingDataItemId,
        underlyingDataConfig?.dateZoom,
    );

    const exploreFromHereUrl = useMemo(() => {
        if (!resultsData) {
            return undefined;
        }
        const createSavedChartVersion: CreateSavedChartVersion = {
            tableName: resultsData.metricQuery.exploreName,
            metricQuery: resultsData.metricQuery,
            pivotConfig: undefined,
            tableConfig: {
                columnOrder: [],
            },
            chartConfig: {
                type: ChartType.CARTESIAN,
                config: { layout: {}, eChartsConfig: {} },
            },
        };
        const { pathname, search } = getExplorerUrlFromCreateSavedChartVersion(
            projectUuid,
            createSavedChartVersion,
        );
        return `${pathname}?${search}`;
    }, [resultsData, projectUuid]);

    const getDownloadQueryUuid = useCallback(
        async (limit: number | null) => {
            if (limit === null || limit !== resultsData?.rows.length) {
                // Get new query uuid with new limit
                const newQuery = await getUnderlyingDataResults(projectUuid!, {
                    context: QueryExecutionContext.VIEW_UNDERLYING_DATA,
                    underlyingDataSourceQueryUuid: queryUuid!,
                    underlyingDataItemId,
                    filters: convertDateFilters(filters),
                    dateZoom: underlyingDataConfig?.dateZoom,
                    limit: limit ?? Number.MAX_SAFE_INTEGER,
                });
                return newQuery.queryUuid;
            }
            if (!resultsData) {
                throw new Error('No results data');
            }
            // Use existing query uuid
            return resultsData.queryUuid;
        },
        [
            filters,
            projectUuid,
            queryUuid,
            resultsData,
            underlyingDataConfig?.dateZoom,
            underlyingDataItemId,
        ],
    );

    return (
        <Modal.Content
            ref={modalContentElementSize.ref}
            sx={{
                height: 'calc(100dvh - (1rem * 2))',
                width: 'calc(100dvw - (1rem * 2))',
                overflowY: 'hidden',
            }}
        >
            <Modal.Header ref={modalHeaderElementSize.ref}>
                <Modal.Title w="100%">
                    <Group position="apart">
                        <Title order={5}>View underlying data</Title>
                        <Box mr="md">
                            <Can
                                I="manage"
                                this={subject('ExportCsv', {
                                    organizationUuid:
                                        user.data?.organizationUuid,
                                    projectUuid: projectUuid,
                                })}
                            >
                                <Popover
                                    disabled={!resultsData}
                                    position="bottom-end"
                                    withArrow
                                >
                                    <Popover.Target>
                                        <Button
                                            leftIcon={
                                                <MantineIcon
                                                    icon={IconShare2}
                                                />
                                            }
                                            variant="subtle"
                                            compact
                                            disabled={!resultsData}
                                        >
                                            Export CSV
                                        </Button>
                                    </Popover.Target>
                                    <Popover.Dropdown>
                                        {!!projectUuid && (
                                            <ExportResults
                                                projectUuid={projectUuid}
                                                showTableNames
                                                totalResults={
                                                    resultsData?.rows.length
                                                }
                                                getDownloadQueryUuid={
                                                    getDownloadQueryUuid
                                                }
                                            />
                                        )}
                                    </Popover.Dropdown>
                                </Popover>
                            </Can>
                            <Can
                                I="manage"
                                this={subject('Explore', {
                                    organizationUuid:
                                        user.data?.organizationUuid,
                                    projectUuid: projectUuid,
                                })}
                            >
                                <LinkButton
                                    href={exploreFromHereUrl || ''}
                                    forceRefresh
                                    disabled={!exploreFromHereUrl}
                                >
                                    Explore from here
                                </LinkButton>
                            </Can>
                        </Box>
                    </Group>
                </Modal.Title>

                <Modal.CloseButton />
            </Modal.Header>
            <Modal.Body
                h={
                    modalContentElementSize.height -
                    modalHeaderElementSize.height -
                    40
                }
            >
                {error ? (
                    <ErrorState error={error.error} hasMarginTop={false} />
                ) : (
                    <UnderlyingDataResultsTable
                        isLoading={isInitialLoading}
                        resultsData={resultsData}
                        fieldsMap={resultsData?.fields || {}}
                        hasJoins={joinedTables.length > 0}
                        sortByUnderlyingValues={sortByUnderlyingValues}
                    />
                )}
            </Modal.Body>
        </Modal.Content>
    );
};

export default UnderlyingDataModalContent;
