import { Button, Card, Collapse, H5 } from '@blueprintjs/core';
import { getResultValues } from '@lightdash/common';
import { FC } from 'react';
import {
    ExplorerSection,
    useExplorer,
} from '../../../providers/ExplorerProvider';
import AddColumnButton from '../../AddColumnButton';
import UnderlyingDataModal from '../../common/modal/UnderlyingDataModal';
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
        state: { isEditMode, unsavedChartVersion, expandedSections },
        queryResults,
        actions: { setRowLimit, toggleExpandedSection },
    } = useExplorer();
    const resultsIsOpen = expandedSections.includes(ExplorerSection.RESULTS);
    const { fieldsMap, data, status } = useUnderlyingData();

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
                <ExplorerResults />
            </Collapse>

            <UnderlyingDataModal
                isOpen={true}
                resultsData={data}
                fieldsMap={fieldsMap}
                status={status}
            />
        </Card>
    );
};

export default ResultsCard;
