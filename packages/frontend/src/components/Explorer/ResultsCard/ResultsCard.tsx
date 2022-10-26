import { Button, Collapse, H5 } from '@blueprintjs/core';
import { getResultValues } from '@lightdash/common';
import { FC, memo, useCallback, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import {
    getAllQueryResults,
    getQueryResults,
} from '../../../hooks/useQueryResults';
import {
    ExplorerSection,
    useExplorerContext,
} from '../../../providers/ExplorerProvider';
import AddColumnButton from '../../AddColumnButton';
import DownloadCsvButton from '../../DownloadCsvButton';
import DownloadCsvPopup from '../../DownloadCsvPopup';
import LimitButton from '../../LimitButton';
import SortButton from '../../SortButton';
import UnderlyingDataModal from '../../UnderlyingData/UnderlyingDataModal';
import UnderlyingDataProvider from '../../UnderlyingData/UnderlyingDataProvider';
import { ExplorerResults } from './ExplorerResults';
import {
    CardHeader,
    CardHeaderLeftContent,
    CardHeaderRightContent,
    CardWrapper,
} from './ResultsCard.styles';

const ResultsCard: FC = memo(() => {
    const isEditMode = useExplorerContext(
        (context) => context.state.isEditMode,
    );
    const expandedSections = useExplorerContext(
        (context) => context.state.expandedSections,
    );
    const tableName = useExplorerContext(
        (context) => context.state.unsavedChartVersion.tableName,
    );
    const filters = useExplorerContext(
        (context) => context.state.unsavedChartVersion.metricQuery.filters,
    );
    const limit = useExplorerContext(
        (context) => context.state.unsavedChartVersion.metricQuery.limit,
    );
    const sorts = useExplorerContext(
        (context) => context.state.unsavedChartVersion.metricQuery.sorts,
    );
    const rows = useExplorerContext(
        (context) => context.queryResults.data?.rows,
    );
    const setRowLimit = useExplorerContext(
        (context) => context.actions.setRowLimit,
    );
    const toggleExpandedSection = useExplorerContext(
        (context) => context.actions.toggleExpandedSection,
    );
    const metricQuery = useExplorerContext(
        (context) => context.state.unsavedChartVersion.metricQuery,
    );
    const { projectUuid } = useParams<{ projectUuid: string }>();

    const getCsvResults = (csvLimit: number | null) => {
        return getQueryResults({
            projectUuid,
            tableId: tableName,
            query: metricQuery,
            csvLimit,
        }).then((results) => getResultValues(results.rows));
    };

    const resultsIsOpen = useMemo(
        () => expandedSections.includes(ExplorerSection.RESULTS),
        [expandedSections],
    );
    const toggleCard = useCallback(
        () => toggleExpandedSection(ExplorerSection.RESULTS),
        [toggleExpandedSection],
    );
    const formattedRows = useMemo(() => rows && getResultValues(rows), [rows]);
    return (
        <CardWrapper elevation={1}>
            <CardHeader>
                <CardHeaderLeftContent>
                    <Button
                        icon={resultsIsOpen ? 'chevron-down' : 'chevron-right'}
                        minimal
                        onClick={toggleCard}
                        disabled={!tableName}
                    />

                    <H5>Results</H5>

                    {tableName && (
                        <LimitButton
                            isEditMode={isEditMode}
                            limit={limit}
                            onLimitChange={setRowLimit}
                        />
                    )}

                    {tableName && sorts.length > 0 && (
                        <SortButton isEditMode={isEditMode} sorts={sorts} />
                    )}
                </CardHeaderLeftContent>

                {resultsIsOpen && tableName && (
                    <CardHeaderRightContent>
                        {isEditMode && <AddColumnButton />}
                        <DownloadCsvPopup
                            fileName={tableName}
                            rows={formattedRows}
                            getCsvResults={getCsvResults}
                        />
                    </CardHeaderRightContent>
                )}
            </CardHeader>
            <Collapse isOpen={resultsIsOpen}>
                <UnderlyingDataProvider tableName={tableName} filters={filters}>
                    <ExplorerResults />
                    <UnderlyingDataModal />
                </UnderlyingDataProvider>
            </Collapse>
        </CardWrapper>
    );
});

export default ResultsCard;
