import { subject } from '@casl/ability';
import { Button, Modal, NumberInput, Popover, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconPlus, IconShare2 } from '@tabler/icons-react';
import { FC, memo, useCallback, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { downloadCsv } from '../../../api/csv';
import { uploadGsheet } from '../../../hooks/gdrive/useGdrive';
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
    const setPeriodOverPeriodConfig = useExplorerContext(
        (context) => context.actions.setPeriodOverPeriodConfig,
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

    const form = useForm({
        initialValues: {
            dateDimension: '',
            periodCount: 1,
            periodGrain: 'YEAR',
        },
    });

    const [popIsOpen, setPopIsOpen] = useState(false);
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
                        <Button
                            leftIcon={<MantineIcon icon={IconPlus} />}
                            onClick={(e) => {
                                e.stopPropagation();
                                setPopIsOpen(true);
                            }}
                            variant="default"
                            size="xs"
                        >
                            Add Period-over-Period
                        </Button>
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
            <Modal
                title="Lets analyse"
                size="lg"
                opened={popIsOpen}
                onClose={() => setPopIsOpen(false)}
            >
                <form
                    onSubmit={form.onSubmit((vals) => {
                        setPeriodOverPeriodConfig(vals);
                        setPopIsOpen(false);
                    })}
                >
                    <TextInput
                        label="Date dimension"
                        {...form.getInputProps('dateDimension')}
                    />
                    <NumberInput
                        label="Periods"
                        {...form.getInputProps('periodCount')}
                    />
                    <TextInput
                        label="Period grain"
                        {...form.getInputProps('periodGrain')}
                    />
                    <Button type="submit">
                        Add period over period analysis
                    </Button>
                </form>
            </Modal>
        </CollapsableCard>
    );
});

export default ResultsCard;
