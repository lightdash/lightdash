import { SchedulerFormat } from '@lightdash/common';
import { useMemo, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { type useSchedulerFilters } from '../../../features/scheduler/hooks/useSchedulerFilters';
import FilterFacet, { type FilterFacetOption } from '../../common/FilterFacet';

type FormatFilterProps = Pick<
    ReturnType<typeof useSchedulerFilters>,
    'selectedFormats' | 'setSelectedFormats'
>;

const FORMAT_LABEL_KEYS: Record<SchedulerFormat, string> = {
    [SchedulerFormat.CSV]: 'formats.csv',
    [SchedulerFormat.XLSX]: 'formats.xlsx',
    [SchedulerFormat.IMAGE]: 'formats.image',
    [SchedulerFormat.GSHEETS]: 'formats.googleSheets',
    [SchedulerFormat.PDF]: 'formats.pdf',
};

const FormatFilter: FC<FormatFilterProps> = ({
    selectedFormats,
    setSelectedFormats,
}) => {
    const { t } = useTranslation('scheduler');
    const options = useMemo<FilterFacetOption[]>(
        () =>
            Object.values(SchedulerFormat).map((format) => ({
                value: format,
                label: t(FORMAT_LABEL_KEYS[format]),
            })),
        [t],
    );
    return (
        <FilterFacet
            label={t('filters.format.label')}
            options={options}
            selected={selectedFormats}
            onChange={(values) =>
                setSelectedFormats(values as SchedulerFormat[])
            }
            tooltipLabel={t('filters.format.tooltip')}
        />
    );
};

export default FormatFilter;
