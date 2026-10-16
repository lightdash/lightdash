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
import { useTranslation } from 'react-i18next';
import Callout from '../../components/common/Callout';
import MantineModal from '../../components/common/MantineModal';
import { useChartSummariesV2 } from '../../hooks/useChartSummariesV2';
import { getSavedQuery } from '../../hooks/useSavedQuery';
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
    const { t } = useTranslation('documents');
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
                    await getSavedQuery(selected.uuid, projectUuid),
                ),
            );
        } catch {
            setCopyError(t('savedChartPicker.copyFailed'));
            setIsCopying(false);
        }
    };

    return (
        <MantineModal
            opened
            onClose={onClose}
            title={t('savedChartPicker.title')}
            icon={IconLink}
            size="lg"
            onConfirm={() => void submit()}
            confirmLabel={
                mode === 'copy' && canCopy
                    ? t('savedChartPicker.copyChart')
                    : t('savedChartPicker.linkChart')
            }
            confirmDisabled={!selected}
            confirmLoading={isCopying}
        >
            <Stack gap="md">
                <Select
                    label={t('savedChartPicker.chartLabel')}
                    placeholder={t('savedChartPicker.searchPlaceholder')}
                    searchable
                    data-autofocus
                    searchValue={search}
                    onSearchChange={setSearch}
                    // Search runs on the server
                    filter={({ options }) => options}
                    nothingFoundMessage={
                        isFetching
                            ? t('savedChartPicker.searching')
                            : t('savedChartPicker.noneFound')
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
                            ? t('savedChartPicker.sqlChartInSpace', {
                                  space: selected.space.name,
                              })
                            : t('savedChartPicker.chartInSpace', {
                                  space: selected.space.name,
                              })}
                    </Text>
                )}
                <SegmentedControl
                    value={mode}
                    onChange={(value) => setMode(value as Mode)}
                    data={[
                        { value: 'link', label: t('savedChartPicker.link') },
                        {
                            value: 'copy',
                            label: t('savedChartPicker.copy'),
                            disabled: selected !== undefined && !canCopy,
                        },
                    ]}
                />
                <Text size="sm" c="dimmed">
                    {mode === 'link'
                        ? t('savedChartPicker.linkHelp')
                        : t('savedChartPicker.copyHelp')}
                </Text>
                {copyError && <Callout variant="danger" title={copyError} />}
            </Stack>
        </MantineModal>
    );
};

export default DocumentSavedChartPickerModal;
