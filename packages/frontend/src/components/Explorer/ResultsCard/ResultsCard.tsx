import { Button, Collapse, H5 } from '@blueprintjs/core';
import { getResultValues } from '@lightdash/common';
import { FC, memo, useCallback, useMemo } from 'react';
import {
    ExplorerSection,
    useExplorerContext,
} from '../../../providers/ExplorerProvider';
import AddColumnButton from '../../AddColumnButton';
import DownloadCsvButton from '../../DownloadCsvButton';
import LimitButton from '../../LimitButton';
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
    const rows = useExplorerContext(
        (context) => context.queryResults.data?.rows,
    );
    const setRowLimit = useExplorerContext(
        (context) => context.actions.setRowLimit,
    );
    const toggleExpandedSection = useExplorerContext(
        (context) => context.actions.toggleExpandedSection,
    );

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
                    {isEditMode && resultsIsOpen && tableName && (
                        <LimitButton
                            limit={limit}
                            onLimitChange={setRowLimit}
                        />
                    )}
                </CardHeaderLeftContent>
                {resultsIsOpen && tableName && (
                    <CardHeaderRightContent>
                        {isEditMode && <AddColumnButton />}
                        <DownloadCsvButton
                            fileName={tableName}
                            rows={formattedRows}
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
