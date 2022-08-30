import { Button, Card, Collapse, H5 } from '@blueprintjs/core';
import { getResultValues } from '@lightdash/common';
import { FC, memo } from 'react';
import { useContextSelector } from 'use-context-selector';
import { Context, ExplorerSection } from '../../../providers/ExplorerProvider';
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
} from './ResultsCard.styles';

const ResultsCard: FC = memo(() => {
    const isEditMode = useContextSelector(
        Context,
        (context) => context!.state.isEditMode,
    );
    const expandedSections = useContextSelector(
        Context,
        (context) => context!.state.expandedSections,
    );
    const tableName = useContextSelector(
        Context,
        (context) => context!.state.unsavedChartVersion.tableName,
    );
    const filters = useContextSelector(
        Context,
        (context) => context!.state.unsavedChartVersion.metricQuery.filters,
    );
    const limit = useContextSelector(
        Context,
        (context) => context!.state.unsavedChartVersion.metricQuery.limit,
    );
    const queryResults = useContextSelector(
        Context,
        (context) => context!.queryResults.data,
    );
    const setRowLimit = useContextSelector(
        Context,
        (context) => context!.actions.setRowLimit,
    );
    const toggleExpandedSection = useContextSelector(
        Context,
        (context) => context!.actions.toggleExpandedSection,
    );
    const resultsIsOpen = expandedSections.includes(ExplorerSection.RESULTS);
    return (
        <Card style={{ padding: 5 }} elevation={1}>
            <CardHeader>
                <CardHeaderLeftContent>
                    <Button
                        icon={resultsIsOpen ? 'chevron-down' : 'chevron-right'}
                        minimal
                        onClick={() =>
                            toggleExpandedSection(ExplorerSection.RESULTS)
                        }
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
                            rows={
                                queryResults &&
                                getResultValues(queryResults.rows)
                            }
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
        </Card>
    );
});

export default ResultsCard;
