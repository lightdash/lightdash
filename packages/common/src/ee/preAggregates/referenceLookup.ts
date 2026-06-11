import { getParsedReference } from '../../compiler/exploreCompiler';
import {
    getReferencedDimension,
    getReferencedDimensionCaseInsensitive,
    getReferencedMetric,
} from '../../compiler/referenceLookup';
import type { CompiledTable } from '../../types/explore';
import type { CompiledDimension, CompiledMetric } from '../../types/field';

export type PreAggregateReferenceLookup = Record<
    string,
    Pick<CompiledTable, 'name' | 'originalName' | 'dimensions' | 'metrics'>
>;

const getParsedMetricReference = ({
    metric,
    ref,
}: {
    metric: CompiledMetric;
    ref: string;
}) => {
    if (ref === 'TABLE') {
        return undefined;
    }

    return getParsedReference(ref, metric.table);
};

export const getReferencedDimensionForPreAggregation = ({
    metric,
    ref,
    tables,
}: {
    metric: CompiledMetric;
    ref: string;
    tables: PreAggregateReferenceLookup;
}): CompiledDimension | undefined => {
    const parsedReference = getParsedMetricReference({ metric, ref });
    if (!parsedReference) {
        return undefined;
    }

    return getReferencedDimension(
        parsedReference.refTable,
        parsedReference.refName,
        tables,
    );
};

export const getReferencedMetricForPreAggregation = ({
    metric,
    ref,
    tables,
}: {
    metric: CompiledMetric;
    ref: string;
    tables: PreAggregateReferenceLookup;
}): CompiledMetric | undefined => {
    const parsedReference = getParsedMetricReference({ metric, ref });
    if (!parsedReference) {
        return undefined;
    }

    return getReferencedMetric(
        parsedReference.refTable,
        parsedReference.refName,
        tables,
    );
};

export const getReferencedFilterDimensionForPreAggregation = ({
    metric,
    fieldRef,
    tables,
}: {
    metric: CompiledMetric;
    fieldRef: string;
    tables: PreAggregateReferenceLookup;
}): CompiledDimension | undefined => {
    const { refTable, refName } = getParsedReference(fieldRef, metric.table);
    return getReferencedDimensionCaseInsensitive(refTable, refName, tables);
};
