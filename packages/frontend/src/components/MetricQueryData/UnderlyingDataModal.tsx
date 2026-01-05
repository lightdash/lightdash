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
import { Button, Divider, Group, Popover } from '@mantine-8/core';
import { IconShare2, IconStack } from '@tabler/icons-react';
import { useCallback, useMemo, type FC } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useOrganization } from '../../hooks/organization/useOrganization';
import { useExplore } from '../../hooks/useExplore';
import { getExplorerUrlFromCreateSavedChartVersion } from '../../hooks/useExplorerRoute';
import { useProjectUuid } from '../../hooks/useProjectUuid';
import {
    getUnderlyingDataResults,
    useUnderlyingDataResults,
} from '../../hooks/useUnderlyingDataResults';
import { Can } from '../../providers/Ability';
import { useAbilityContext } from '../../providers/Ability/useAbilityContext';
import useApp from '../../providers/App/useApp';
import { convertDateFilters } from '../../utils/dateFilter';
import ErrorState from '../common/ErrorState';
import LinkButton from '../common/LinkButton';
import MantineIcon from '../common/MantineIcon';
import MantineModal from '../common/MantineModal';
import { type TableColumn } from '../common/Table/types';
import ExportResults from '../ExportResults';
import UnderlyingDataResultsTable from './UnderlyingDataResultsTable';
import { useMetricQueryDataContext } from './useMetricQueryDataContext';

const UnderlyingDataModal: FC = () => {
    const projectUuid = useProjectUuid();
    const {
        isUnderlyingDataModalOpen,
        closeUnderlyingDataModal,
        tableName,
        metricQuery,
        underlyingDataConfig,
        queryUuid,
        parameters,
    } = useMetricQueryDataContext();

    const { user } = useApp();
    const { data: organization } = useOrganization();

    const { data: explore } = useExplore(tableName, { refetchOnMount: false });
    const ability = useAbilityContext();

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
        parameters,
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
                const newQuery = await getUnderlyingDataResults(
                    projectUuid!,
                    {
                        context: QueryExecutionContext.VIEW_UNDERLYING_DATA,
                        underlyingDataSourceQueryUuid: queryUuid!,
                        underlyingDataItemId,
                        filters: convertDateFilters(filters),
                        dateZoom: underlyingDataConfig?.dateZoom,
                        limit,
                    },
                    undefined,
                    parameters,
                );
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
            parameters,
        ],
    );

    const canExportCsv =
        ability.can(
            'manage',
            subject('ExportCsv', {
                organizationUuid: user.data?.organizationUuid,
                projectUuid: projectUuid,
            }),
        ) ||
        ability.can(
            'export',
            subject('Dashboard', {
                type: 'csv',
                organizationUuid: organization?.organizationUuid,
            }),
        );

    const headerActions = (
        <Group gap="sm">
            {canExportCsv && (
                <Popover
                    disabled={!resultsData}
                    position="bottom-end"
                    withArrow
                >
                    <Popover.Target>
                        <Button
                            leftSection={<MantineIcon icon={IconShare2} />}
                            variant="light"
                            color="foreground.9"
                            size="compact-sm"
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
                                totalResults={resultsData?.rows.length}
                                getDownloadQueryUuid={getDownloadQueryUuid}
                            />
                        )}
                    </Popover.Dropdown>
                </Popover>
            )}
            <Can
                I="manage"
                this={subject('Explore', {
                    organizationUuid: user.data?.organizationUuid,
                    projectUuid: projectUuid,
                })}
            >
                <Divider orientation="vertical" />
                <LinkButton
                    href={exploreFromHereUrl || ''}
                    forceRefresh
                    disabled={!exploreFromHereUrl}
                    variant="light"
                    radius="md"
                >
                    Explore from here
                </LinkButton>
            </Can>
        </Group>
    );

    return (
        <MantineModal
            opened={isUnderlyingDataModalOpen}
            icon={IconStack}
            onClose={closeUnderlyingDataModal}
            title="View underlying data"
            fullScreen
            headerActions={headerActions}
            cancelLabel={false}
            modalBodyProps={{ px: 'md', py: 'sm' }}
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
        </MantineModal>
    );
};

export default UnderlyingDataModal;
