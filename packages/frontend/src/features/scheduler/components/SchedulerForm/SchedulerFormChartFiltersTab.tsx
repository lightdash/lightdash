import { type Filters, type ItemsMap } from '@lightdash/common';
import { type FC } from 'react';
import FiltersForm from '../../../../components/common/Filters';
import FiltersProvider from '../../../../components/common/Filters/FiltersProvider';

type Props = {
    projectUuid: string | undefined;
    itemsMap: ItemsMap | undefined;
    filters: Filters;
    onChange: (filters: Filters) => void;
};

const EMPTY_ITEMS_MAP: ItemsMap = {};

export const SchedulerFormChartFiltersTab: FC<Props> = ({
    projectUuid,
    itemsMap,
    filters,
    onChange,
}) => {
    return (
        <FiltersProvider
            projectUuid={projectUuid}
            itemsMap={itemsMap ?? EMPTY_ITEMS_MAP}
            popoverProps={{ withinPortal: true }}
        >
            {/* Configuring an alert is always editing, so the builder is editable */}
            <FiltersForm isEditMode filters={filters} setFilters={onChange} />
        </FiltersProvider>
    );
};
