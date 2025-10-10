import { subject } from '@casl/ability';
import { ActionIcon, Popover } from '@mantine/core';
import { IconShare2 } from '@tabler/icons-react';
import { memo, useCallback, useMemo, type FC } from 'react';
import {
    explorerActions,
    selectColumnOrder,
    selectIsEditMode,
    selectIsResultsExpanded,
    selectMetricQuery,
    selectSorts,
    selectTableName,
    useExplorerDispatch,
    useExplorerSelector,
} from '../../../features/explorer/store';
import { uploadGsheet } from '../../../hooks/gdrive/useGdrive';
import { useExplorerQuery } from '../../../hooks/useExplorerQuery';
import { useProjectUuid } from '../../../hooks/useProjectUuid';
import { Can } from '../../../providers/Ability';
import useApp from '../../../providers/App/useApp';
import { ExplorerSection } from '../../../providers/Explorer/types';
import useExplorerContext from '../../../providers/Explorer/useExplorerContext';
import AddColumnButton from '../../AddColumnButton';
import ExportSelector from '../../ExportSelector';
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

    // Get query state from new hook
    const { queryResults, getDownloadQueryUuid } = useExplorerQuery();
    const totalResults = queryResults.totalResults;
    const savedChart = useExplorerContext(
        (context) => context.state.savedChart,
    );

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

    return (
        <CollapsableCard
            title="Results"
            isOpen={resultsIsOpen}
            onToggle={toggleCard}
            disabled={!tableName}
            headerElement={
                <>
                    {tableName && sorts.length > 0 && (
                        <SortButton isEditMode={isEditMode} sorts={sorts} />
                    )}
                </>
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
