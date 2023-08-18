import { subject } from '@casl/ability';
import { Button, Popover } from '@mantine/core';
import { IconShare2 } from '@tabler/icons-react';
import { FC, memo, useCallback, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { uploadGsheet } from '../../../hooks/gdrive/useGdrive';
import { downloadCsv } from '../../../hooks/useDownloadCsv';
import { useApp } from '../../../providers/AppProvider';
import {
    ExplorerSection,
    useExplorerContext,
} from '../../../providers/ExplorerProvider';
import AddColumnButton from '../../AddColumnButton';
import { Can } from '../../common/Authorization';
import CollapsableCard, {
    COLLAPSABLE_CARD_BUTTON_PROPS,
    COLLAPSABLE_CARD_POPOVER_PROPS,
} from '../../common/CollapsableCard';
import MantineIcon from '../../common/MantineIcon';
import ExportSelector from '../../ExportSelector';
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

    const getGsheetLink = async () => {
        const gsheetResponse = await uploadGsheet({
            projectUuid,
            exploreId: tableName,
            metricQuery,
            columnOrder,
            showTableNames: true,
        });
        return gsheetResponse;
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
                            <Popover
                                {...COLLAPSABLE_CARD_POPOVER_PROPS}
                                disabled={disabled}
                                position="bottom-end"
                            >
                                <Popover.Target>
                                    <Button
                                        data-testid="export-csv-button"
                                        {...COLLAPSABLE_CARD_BUTTON_PROPS}
                                        disabled={disabled}
                                        px="xs"
                                    >
                                        <MantineIcon
                                            icon={IconShare2}
                                            color="gray"
                                        />
                                    </Button>
                                </Popover.Target>

                                <Popover.Dropdown>
                                    <ExportSelector
                                        rows={rows}
                                        getCsvLink={getCsvLink}
                                        getGsheetLink={getGsheetLink}
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
