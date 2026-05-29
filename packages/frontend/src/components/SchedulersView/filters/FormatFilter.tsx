import { SchedulerFormat } from '@lightdash/common';
import { type FC } from 'react';
import { type useSchedulerFilters } from '../../../features/scheduler/hooks/useSchedulerFilters';
import FilterFacet, { type FilterFacetOption } from '../../common/FilterFacet';

type FormatFilterProps = Pick<
    ReturnType<typeof useSchedulerFilters>,
    'selectedFormats' | 'setSelectedFormats'
>;

const FORMAT_LABELS: Record<SchedulerFormat, string> = {
    [SchedulerFormat.CSV]: '.csv',
    [SchedulerFormat.XLSX]: '.xlsx',
    [SchedulerFormat.IMAGE]: 'Image',
    [SchedulerFormat.GSHEETS]: 'Google Sheets',
    [SchedulerFormat.PDF]: 'PDF',
};

const ALL_FORMAT_OPTIONS: FilterFacetOption[] = Object.values(
    SchedulerFormat,
).map((format) => ({
    value: format,
    label: FORMAT_LABELS[format],
}));

const FormatFilter: FC<FormatFilterProps> = ({
    selectedFormats,
    setSelectedFormats,
}) => (
    <FilterFacet
        label="Format"
        options={ALL_FORMAT_OPTIONS}
        selected={selectedFormats}
        onChange={(values) => setSelectedFormats(values as SchedulerFormat[])}
        tooltipLabel="Filter schedulers by format"
    />
);

export default FormatFilter;
