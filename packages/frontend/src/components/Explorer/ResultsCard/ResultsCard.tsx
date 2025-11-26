import { subject } from '@casl/ability';
import { FeatureFlags, getItemMap } from '@lightdash/common';
import { ActionIcon, Group, Popover } from '@mantine/core';
import { IconShare2 } from '@tabler/icons-react';
import { memo, useCallback, useMemo, type FC } from 'react';
import {
    explorerActions,
    selectAdditionalMetrics,
    selectColumnOrder,
    selectIsEditMode,
    selectIsResultsExpanded,
    selectMetricQuery,
    selectSavedChart,
    selectSorts,
    selectTableCalculations,
    selectTableName,
    useExplorerDispatch,
    useExplorerSelector,
} from '../../../features/explorer/store';
import { uploadGsheet } from '../../../hooks/gdrive/useGdrive';
import { useExplore } from '../../../hooks/useExplore';
import { useExplorerQuery } from '../../../hooks/useExplorerQuery';
import { useFeatureFlagEnabled } from '../../../hooks/useFeatureFlagEnabled';
import { useProjectUuid } from '../../../hooks/useProjectUuid';
import { Can } from '../../../providers/Ability';
import useApp from '../../../providers/App/useApp';
import { ExplorerSection } from '../../../providers/Explorer/types';
import AddColumnButton from '../../AddColumnButton';
import ExportSelector from '../../ExportSelector';
import PeriodOverPeriodButton from '../../PeriodOverPeriodButton';
import SortButton from '../../SortButton';
import CollapsableCard from '../../common/CollapsableCard/CollapsableCard';
import {
    COLLAPSABLE_CARD_ACTION_ICON_PROPS,
    COLLAPSABLE_CARD_POPOVER_PROPS,
} from '../../common/CollapsableCard/constants';
import MantineIcon from '../../common/MantineIcon';
import { ExplorerResults } from './ExplorerResults';

const ResultsCard: FC = memo(() => {
    const projectUuid = useProjectUuid();

    const isEditMode = useExplorerSelector(selectIsEditMode);
    const resultsIsOpen = useExplorerSelector(selectIsResultsExpanded);
    const dispatch = useExplorerDispatch();
    const tableName = useExplorerSelector(selectTableName);
    const sorts = useExplorerSelector(selectSorts);
    const metricQuery = useExplorerSelector(selectMetricQuery);
    const columnOrder = useExplorerSelector(selectColumnOrder);
    const additionalMetrics = useExplorerSelector(selectAdditionalMetrics);
    const tableCalculations = useExplorerSelector(selectTableCalculations);

    const { queryResults, getDownloadQueryUuid } = useExplorerQuery();

    // Get explore data to build itemsMap for PeriodOverPeriodButton
    const { data: exploreData } = useExplore(tableName, {
        refetchOnMount: false,
    });

    const itemsMap = useMemo(() => {
        if (exploreData) {
            return getItemMap(
                exploreData,
                additionalMetrics,
                tableCalculations,
            );
        }
        return undefined;
    }, [exploreData, additionalMetrics, tableCalculations]);
    const totalResults = queryResults.totalResults;

    const savedChart = useExplorerSelector(selectSavedChart);

    const toggleExpandedSection = useCallback(
        (section: ExplorerSection) => {
            dispatch(explorerActions.toggleExpandedSection(section));
        },
        [dispatch],
    );

    const disabled = useMemo(() => (totalResults ?? 0) <= 0, [totalResults]);

    const toggleCard = useCallback(
        () => toggleExpandedSection(ExplorerSection.RESULTS),
        [toggleExpandedSection],
    );
    const { user } = useApp();

    const getGsheetLink = async () => {
        if (projectUuid) {
            return uploadGsheet({
                projectUuid,
                exploreId: tableName,
                metricQuery,
                columnOrder,
                showTableNames: true,
                // No pivotConfig - ResultsCard only shows raw table data
            });
        } else {
            throw new Error('Project UUID is missing');
        }
    };

    // ResultsCard always downloads raw unpivoted results
    const getResultsCardDownloadQueryUuid = useCallback(
        (limit: number | null) => {
            return getDownloadQueryUuid(limit, false);
        },
        [getDownloadQueryUuid],
    );

    const showPeriodOverPeriod = useFeatureFlagEnabled(
        FeatureFlags.PeriodOverPeriod,
    );

    return (
        <CollapsableCard
            title="Results"
            isOpen={resultsIsOpen}
            onToggle={toggleCard}
            disabled={!tableName}
            headerElement={
                <Group noWrap spacing="xs">
                    {tableName && sorts.length > 0 && (
                        <SortButton isEditMode={isEditMode} sorts={sorts} />
                    )}
                    {showPeriodOverPeriod && (
                        <PeriodOverPeriodButton
                            itemsMap={itemsMap}
                            disabled={!isEditMode}
                        />
                    )}
                </Group>
            }
            rightHeaderElement={
                projectUuid &&
                resultsIsOpen &&
                tableName && (
                    <>
                        <Can
                            I="manage"
                            this={subject('Explore', {
                                organizationUuid: user.data?.organizationUuid,
                                projectUuid,
                            })}
                        >
                            {isEditMode && <AddColumnButton />}
                        </Can>

                        <Can
                            I="manage"
                            this={subject('ExportCsv', {
                                organizationUuid: user.data?.organizationUuid,
                                projectUuid,
                            })}
                        >
                            <Popover
                                {...COLLAPSABLE_CARD_POPOVER_PROPS}
                                disabled={disabled}
                                position="bottom-end"
                            >
                                <Popover.Target>
                                    <ActionIcon
                                        data-testid="export-csv-button"
                                        {...COLLAPSABLE_CARD_ACTION_ICON_PROPS}
                                        disabled={disabled}
                                    >
                                        <MantineIcon icon={IconShare2} />
                                    </ActionIcon>
                                </Popover.Target>

                                <Popover.Dropdown>
                                    <ExportSelector
                                        projectUuid={projectUuid}
                                        totalResults={totalResults}
                                        getDownloadQueryUuid={
                                            getResultsCardDownloadQueryUuid
                                        }
                                        getGsheetLink={getGsheetLink}
                                        columnOrder={columnOrder}
                                        customLabels={undefined} // for results table download, don't override labels
                                        hiddenFields={undefined} // for results table download, don't hide columns
                                        chartName={savedChart?.name}
                                        showTableNames
                                    />
                                </Popover.Dropdown>
                            </Popover>
                        </Can>
                    </>
                )
            }
        >
            <ExplorerResults />
        </CollapsableCard>
    );
});

export default ResultsCard;
