import { useMemo, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import FilterFacet, { type FilterFacetOption } from '../common/FilterFacet';
import {
    ALL_QUERY_TYPES,
    formatMissReason,
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

export const QueryTypeFilter: FC<QueryTypeFilterProps> = ({
    selected,
    onChange,
}) => {
    const { t } = useTranslation('app');
    const options = useMemo<FilterFacetOption[]>(
        () =>
            ALL_QUERY_TYPES.map((type) => ({
                value: type,
                label: t(`preAggregateAudit.queryTypes.${type}`),
            })),
        [t],
    );
    return (
        <FilterFacet
            label={t('preAggregateAudit.filters.type')}
            mode="single"
            options={options}
            selected={fromSingleValue(selected)}
            onChange={(values) => onChange(toSingleValue<QueryType>(values))}
            tooltipLabel={t('preAggregateAudit.filters.typeTooltip')}
        />
    );
};

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
    const { t } = useTranslation('app');
    const options = useMemo<FilterFacetOption[]>(
        () => explores.map((explore) => ({ value: explore, label: explore })),
        [explores],
    );
    return (
        <FilterFacet
            label={t('preAggregateAudit.filters.explore')}
            mode="single"
            options={options}
            selected={fromSingleValue(selected)}
            onChange={(values) => onChange(toSingleValue(values))}
            tooltipLabel={t('preAggregateAudit.filters.exploreTooltip')}
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
    const { t } = useTranslation('app');
    const options = useMemo<FilterFacetOption[]>(
        () => names.map((name) => ({ value: name, label: name })),
        [names],
    );
    return (
        <FilterFacet
            label={t('preAggregateAudit.filters.preAggregate')}
            mode="single"
            options={options}
            selected={fromSingleValue(selected)}
            onChange={(values) => onChange(toSingleValue(values))}
            tooltipLabel={t('preAggregateAudit.filters.preAggregateTooltip')}
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
    const { t } = useTranslation('app');
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
            label={t('preAggregateAudit.filters.reason')}
            mode="single"
            options={options}
            selected={fromSingleValue(selected)}
            onChange={(values) => onChange(toSingleValue(values))}
            tooltipLabel={t('preAggregateAudit.filters.reasonTooltip')}
        />
    );
};
