import { useMemo, type FC } from 'react';
import FilterFacet, { type FilterFacetOption } from '../common/FilterFacet';
import {
    ALL_QUERY_TYPES,
    formatMissReason,
    QUERY_TYPE_LABELS,
    type QueryType,
} from './preAggregateHelpers';

const toSingleValue = <T extends string>(values: string[]): T | null =>
    (values[0] as T) ?? null;

const fromSingleValue = (value: string | null): string[] =>
    value === null ? [] : [value];

// --- Query Type Filter ---

type QueryTypeFilterProps = {
    selected: QueryType | null;
    onChange: (value: QueryType | null) => void;
};

const QUERY_TYPE_OPTIONS: FilterFacetOption[] = ALL_QUERY_TYPES.map((type) => ({
    value: type,
    label: QUERY_TYPE_LABELS[type],
}));

export const QueryTypeFilter: FC<QueryTypeFilterProps> = ({
    selected,
    onChange,
}) => (
    <FilterFacet
        label="Type"
        mode="single"
        options={QUERY_TYPE_OPTIONS}
        selected={fromSingleValue(selected)}
        onChange={(values) => onChange(toSingleValue<QueryType>(values))}
        tooltipLabel="Filter by query type"
    />
);

// --- Explore Filter ---

type ExploreFilterProps = {
    explores: string[];
    selected: string | null;
    onChange: (value: string | null) => void;
};

export const ExploreFilter: FC<ExploreFilterProps> = ({
    explores,
    selected,
    onChange,
}) => {
    const options = useMemo<FilterFacetOption[]>(
        () => explores.map((explore) => ({ value: explore, label: explore })),
        [explores],
    );
    return (
        <FilterFacet
            label="Explore"
            mode="single"
            options={options}
            selected={fromSingleValue(selected)}
            onChange={(values) => onChange(toSingleValue(values))}
            tooltipLabel="Filter by explore"
        />
    );
};

// --- Pre-aggregate Filter ---

type PreAggregateFilterProps = {
    names: string[];
    selected: string | null;
    onChange: (value: string | null) => void;
};

export const PreAggregateFilter: FC<PreAggregateFilterProps> = ({
    names,
    selected,
    onChange,
}) => {
    const options = useMemo<FilterFacetOption[]>(
        () => names.map((name) => ({ value: name, label: name })),
        [names],
    );
    return (
        <FilterFacet
            label="Pre-aggregate"
            mode="single"
            options={options}
            selected={fromSingleValue(selected)}
            onChange={(values) => onChange(toSingleValue(values))}
            tooltipLabel="Filter by pre-aggregate"
        />
    );
};

// --- Miss Reason Filter ---

type MissReasonFilterProps = {
    reasons: string[];
    selected: string | null;
    onChange: (value: string | null) => void;
};

export const MissReasonFilter: FC<MissReasonFilterProps> = ({
    reasons,
    selected,
    onChange,
}) => {
    const options = useMemo<FilterFacetOption[]>(
        () =>
            reasons.map((reason) => ({
                value: reason,
                label: formatMissReason(reason),
            })),
        [reasons],
    );
    return (
        <FilterFacet
            label="Reason"
            mode="single"
            options={options}
            selected={fromSingleValue(selected)}
            onChange={(values) => onChange(toSingleValue(values))}
            tooltipLabel="Filter by miss reason"
        />
    );
};
