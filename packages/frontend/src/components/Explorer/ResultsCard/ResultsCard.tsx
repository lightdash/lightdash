import { subject } from '@casl/ability';
import { ActionIcon, Popover } from '@mantine/core';
import { IconShare2 } from '@tabler/icons-react';
import { memo, useCallback, useMemo, type FC } from 'react';
import { useParams } from 'react-router';
import { uploadGsheet } from '../../../hooks/gdrive/useGdrive';
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
    const isEditMode = useExplorerContext(
        (context) => context.state.isEditMode,
    );
    const expandedSections = useExplorerContext(
        (context) => context.state.expandedSections,
    );
    const tableName = useExplorerContext(
        (context) => context.state.unsavedChartVersion.tableName,
    );
    const sorts = useExplorerContext(
        (context) => context.state.unsavedChartVersion.metricQuery.sorts,
    );

    const totalResults = useExplorerContext(
        (context) => context.queryResults.totalResults,
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
    const getDownloadQueryUuid = useExplorerContext(
        (context) => context.actions.getDownloadQueryUuid,
    );

    const savedChart = useExplorerContext(
        (context) => context.state.savedChart,
    );

    const disabled = useMemo(() => (totalResults ?? 0) <= 0, [totalResults]);

    const { projectUuid } = useParams<{ projectUuid: string }>();

    const resultsIsOpen = useMemo(
        () => expandedSections.includes(ExplorerSection.RESULTS),
        [expandedSections],
    );
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
                                    <ActionIcon
                                        data-testid="export-csv-button"
                                        {...COLLAPSABLE_CARD_ACTION_ICON_PROPS}
                                        disabled={disabled}
                                    >
                                        <MantineIcon
                                            icon={IconShare2}
                                            color="gray"
                                        />
                                    </ActionIcon>
                                </Popover.Target>

                                <Popover.Dropdown>
                                    <ExportSelector
                                        projectUuid={projectUuid}
                                        totalResults={totalResults}
                                        getDownloadQueryUuid={
                                            getDownloadQueryUuid
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
