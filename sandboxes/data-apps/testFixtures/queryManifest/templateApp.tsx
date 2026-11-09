import { query, savedChart, useLightdash } from '@lightdash/query-sdk';
import { useMemo, useState } from 'react';
import { buildFilters } from './helpers';
import { useGlobalFilters } from '@/lib/filters';

const EXPLORE = 'orders';
const LINKED_CHART = 'dcfeaf86-4d9b-4b82-b125-fc3b22ef045e';

const baseRevenueQuery = query(EXPLORE)
    .id('revenue-by-segment')
    .label('Revenue by Segment')
    .dimensions(['customer_segment'])
    .metrics(['total_revenue']);

export function RevenueBySegment() {
    const { filtersFor } = useGlobalFilters();
    const q = useMemo(
        () => baseRevenueQuery.filters(filtersFor(EXPLORE)),
        [filtersFor],
    );
    const { data, lineage } = useLightdash(q);
    return <div {...lineage}>{data.length}</div>;
}

export function RevenueTrend() {
    const [grain, setGrain] = useState('month');
    const q = useMemo(
        () =>
            query(EXPLORE)
                .id('revenue-trend')
                .dimensions([`order_date_${grain}`])
                .metrics(['total_revenue'])
                .sorts([{ field: `order_date_${grain}`, direction: 'asc' }])
                .limit(200),
        [grain],
    );
    const { data } = useLightdash(q);
    return (
        <button onClick={() => setGrain('week')}>
            {grain} {data.length}
        </button>
    );
}

export function LinkedChart() {
    const { filtersFor } = useGlobalFilters();
    const q = useMemo(
        () =>
            savedChart(LINKED_CHART)
                .label('Orders area')
                .filters(filtersFor(EXPLORE)),
        [filtersFor],
    );
    const { data } = useLightdash(q);
    return <div>{data.length}</div>;
}

export function Dynamic(props: { explore: string; state: unknown }) {
    const q = useMemo(
        () =>
            query(props.explore)
                .metrics(['count'])
                .filters(buildFilters(props.state)),
        [props.explore, props.state],
    );
    const { data } = useLightdash(q);
    return <div>{data.length}</div>;
}
