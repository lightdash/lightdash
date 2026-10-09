import {
    ChartSourceType,
    type ChartContent,
    type DocumentSavedChartKind,
    type SemanticChartAsCode,
} from '@lightdash/common';
import { SegmentedControl, Select, Stack, Text } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { IconLink } from '@tabler/icons-react';
import { useMemo, useState, type FC } from 'react';
import Callout from '../../components/common/Callout';
import MantineModal from '../../components/common/MantineModal';
import { useChartSummariesV2 } from '../../hooks/useChartSummariesV2';
import { getSavedQuery } from '../../hooks/useSavedQuery';
import { useLightdashApi } from '../../providers/LightdashApi/useLightdashApi';
import { toSemanticChartAsCode } from './savedChartContent';

const PAGE_SIZE = 50;

type Mode = 'link' | 'copy';

type Props = {
    projectUuid: string;
    canCopyChart: boolean;
    onClose: () => void;
    onLink: (kind: DocumentSavedChartKind, uuid: string) => void;
    /** Opens the chart editor with a copy of the chart. */
    onCopy: (chart: SemanticChartAsCode) => void;
};

const getKind = (chart: ChartContent): DocumentSavedChartKind =>
    chart.source === ChartSourceType.SQL ? 'sqlChart' : 'chart';

/** Picks a chart saved in a Space to link live, or to copy into the Document. */
const DocumentSavedChartPickerModal: FC<Props> = ({
    projectUuid,
    canCopyChart,
    onClose,
    onLink,
    onCopy,
}) => {
    const lightdashApi = useLightdashApi();
    const [search, setSearch] = useState('');
    const [debouncedSearch] = useDebouncedValue(search, 300);
    const [selectedUuid, setSelectedUuid] = useState<string | null>(null);
    const [mode, setMode] = useState<Mode>('link');
    const [isCopying, setIsCopying] = useState(false);
    const [copyError, setCopyError] = useState<string | null>(null);
    const { data, isFetching } = useChartSummariesV2(
        { projectUuid, page: 1, pageSize: PAGE_SIZE, search: debouncedSearch },
        { keepPreviousData: true },
    );
    // Charts saved in a dashboard can't be linked
    const charts = useMemo(
        () =>
            (data?.pages.flatMap((page) => page.data) ?? []).filter(
                (chart) => chart.dashboard === null,
            ),
        [data],
    );
    const selected = charts.find((chart) => chart.uuid === selectedUuid);
    // SQL charts can only be linked: Documents have no SQL chart editor
    const canCopy =
        selected !== undefined && getKind(selected) === 'chart' && canCopyChart;

    const submit = async () => {
        if (!selected) {
            return;
        }
        const kind = getKind(selected);
        if (mode === 'link' || !canCopy) {
            onLink(kind, selected.uuid);
            return;
        }
        setIsCopying(true);
        setCopyError(null);
        try {
            onCopy(
                toSemanticChartAsCode(
                    await getSavedQuery(
                        lightdashApi,
                        selected.uuid,
                        projectUuid,
                    ),
                ),
            );
        } catch {
            setCopyError("This chart couldn't be loaded. Try linking it.");
            setIsCopying(false);
        }
    };

    return (
        <MantineModal
            opened
            onClose={onClose}
            title="Add a saved chart"
            icon={IconLink}
            size="lg"
            onConfirm={() => void submit()}
            confirmLabel={
                mode === 'copy' && canCopy ? 'Copy chart' : 'Link chart'
            }
            confirmDisabled={!selected}
            confirmLoading={isCopying}
        >
            <Stack gap="md">
                <Select
                    label="Chart"
                    placeholder="Search saved charts"
                    searchable
                    data-autofocus
                    searchValue={search}
                    onSearchChange={setSearch}
                    // Search runs on the server
                    filter={({ options }) => options}
                    nothingFoundMessage={
                        isFetching ? 'Searching…' : 'No saved charts found'
                    }
                    data={charts.map((chart) => ({
                        value: chart.uuid,
                        label: chart.name,
                    }))}
                    value={selectedUuid}
                    onChange={setSelectedUuid}
                    comboboxProps={{ withinPortal: true }}
                />
                {selected && (
                    <Text size="xs" c="dimmed">
                        {selected.source === ChartSourceType.SQL
                            ? 'SQL chart'
                            : 'Chart'}{' '}
                        in {selected.space.name}
                    </Text>
                )}
                <SegmentedControl
                    value={mode}
                    onChange={(value) => setMode(value as Mode)}
                    data={[
                        { value: 'link', label: 'Link' },
                        {
                            value: 'copy',
                            label: 'Copy',
                            disabled: selected !== undefined && !canCopy,
                        },
                    ]}
                />
                <Text size="sm" c="dimmed">
                    {mode === 'link'
                        ? 'Shows the saved chart as it is now, and updates when it changes. Readers need access to the chart.'
                        : 'Adds a copy you can edit in this document. Changes to the saved chart won’t show here.'}
                </Text>
                {copyError && <Callout variant="danger" title={copyError} />}
            </Stack>
        </MantineModal>
    );
};

export default DocumentSavedChartPickerModal;
