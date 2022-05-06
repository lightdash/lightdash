import { Button, Card, Collapse, H5 } from '@blueprintjs/core';
import { getResultValues } from 'common';
import { FC } from 'react';
import {
    ExplorerSection,
    useExplorer,
} from '../../../providers/ExplorerProvider';
import AddColumnButton from '../../AddColumnButton';
import DownloadCsvButton from '../../DownloadCsvButton';
import LimitButton from '../../LimitButton';
import { ExplorerResults } from './ExplorerResults';
import {
    CardHeader,
    CardHeaderLeftContent,
    CardHeaderRightContent,
} from './ResultsCard.styles';

const ResultsCard: FC = () => {
    const {
        state: { unsavedChartVersion, expandedSections },
        queryResults,
        actions: { setRowLimit, toggleExpandedSection },
    } = useExplorer();
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
                    />
                    <H5>Results</H5>
                    {resultsIsOpen && (
                        <LimitButton
                            limit={unsavedChartVersion.metricQuery.limit}
                            onLimitChange={setRowLimit}
                        />
                    )}
                </CardHeaderLeftContent>
                {resultsIsOpen && (
                    <CardHeaderRightContent>
                        <AddColumnButton />
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
                <ExplorerResults />
            </Collapse>
        </Card>
    );
};

export default ResultsCard;
