import { Button, Card, Collapse, H5 } from '@blueprintjs/core';
import { getResultValues } from '@lightdash/common';
import { FC } from 'react';
import {
    ExplorerSection,
    useExplorer,
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
} from './ResultsCard.styles';

const ResultsCard: FC = () => {
    const {
        state,
        queryResults,
        actions: { setRowLimit, toggleExpandedSection },
    } = useExplorer();
    const { isEditMode, unsavedChartVersion, expandedSections } = state;
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
                        disabled={!unsavedChartVersion.tableName}
                    />
                    <H5>Results</H5>
                    {isEditMode &&
                        resultsIsOpen &&
                        unsavedChartVersion.tableName && (
                            <LimitButton
                                limit={unsavedChartVersion.metricQuery.limit}
                                onLimitChange={setRowLimit}
                            />
                        )}
                </CardHeaderLeftContent>
                {resultsIsOpen && unsavedChartVersion.tableName && (
                    <CardHeaderRightContent>
                        {isEditMode && <AddColumnButton />}
                        <DownloadCsvButton
                            fileName={unsavedChartVersion.tableName}
                            rows={
                                queryResults.data &&
                                getResultValues(queryResults.data.rows)
                            }
                        />
                    </CardHeaderRightContent>
                )}
            </CardHeader>
            <Collapse isOpen={resultsIsOpen}>
                <UnderlyingDataProvider exploreState={state}>
                    <ExplorerResults />
                    <UnderlyingDataModal />
                </UnderlyingDataProvider>
            </Collapse>
        </Card>
    );
};

export default ResultsCard;
