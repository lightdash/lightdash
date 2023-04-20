import { Button, PopoverPosition } from '@blueprintjs/core';
import { Classes, Popover2 } from '@blueprintjs/popover2';
import { subject } from '@casl/ability';
import { getResultValues } from '@lightdash/common';
import { FC, memo, useCallback, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { downloadCsv } from '../../../hooks/useDownloadCsv';
import { getQueryResults } from '../../../hooks/useQueryResults';
import { useApp } from '../../../providers/AppProvider';
import {
    ExplorerSection,
    useExplorerContext,
} from '../../../providers/ExplorerProvider';
import AddColumnButton from '../../AddColumnButton';
import { Can } from '../../common/Authorization';
import CollapsableCard from '../../common/CollapsableCard';
import ExportCSV from '../../ExportCSV';
import { useVisualizationContext } from '../../LightdashVisualization/VisualizationProvider';
import LimitButton from '../../LimitButton';
import SortButton from '../../SortButton';
import { ExplorerResults } from './ExplorerResults';

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
    const limit = useExplorerContext(
        (context) => context.state.unsavedChartVersion.metricQuery.limit,
    );
    const sorts = useExplorerContext(
        (context) => context.state.unsavedChartVersion.metricQuery.sorts,
    );
    const rows = useExplorerContext(
        (context) => context.queryResults.data?.rows,
    );
    const resultsData = useExplorerContext(
        (context) => context.queryResults.data,
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

    const columnOrder = useExplorerContext(
        (context) => context.state.unsavedChartVersion.tableConfig.columnOrder,
    );

    const disabled = !resultsData || resultsData.rows.length <= 0;

    const { projectUuid } = useParams<{ projectUuid: string }>();

    const getCsvLink = async (csvLimit: number | null, onlyRaw: boolean) => {
        const csvResponse = await downloadCsv({
            projectUuid,
            tableId: tableName,
            query: metricQuery,
            csvLimit,
            onlyRaw,
            columnOrder,
            showTableNames: true,
        });
        return csvResponse;
    };

    const resultsIsOpen = useMemo(
        () => expandedSections.includes(ExplorerSection.RESULTS),
        [expandedSections],
    );
    const toggleCard = useCallback(
        () => toggleExpandedSection(ExplorerSection.RESULTS),
        [toggleExpandedSection],
    );
    const { user } = useApp();
    return (
        <CollapsableCard
            title="Results"
            isOpen={resultsIsOpen}
            onToggle={toggleCard}
            disabled={!tableName}
            headerElement={
                <>
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
                </>
            }
            rightHeaderElement={
                resultsIsOpen &&
                tableName && (
                    <>
                        {isEditMode && <AddColumnButton />}
                        <Can
                            I="manage"
                            this={subject('ExportCsv', {
                                organizationUuid: user.data?.organizationUuid,
                                projectUuid: projectUuid,
                            })}
                        >
                            <Popover2
                                disabled={disabled}
                                lazy
                                position={PopoverPosition.BOTTOM_LEFT}
                                popoverClassName={
                                    Classes.POPOVER2_CONTENT_SIZING
                                }
                                content={
                                    <ExportCSV
                                        rows={rows}
                                        getCsvLink={getCsvLink}
                                    />
                                }
                            >
                                <Button
                                    text="Export CSV"
                                    rightIcon="caret-down"
                                    minimal
                                    disabled={disabled}
                                />
                            </Popover2>
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
