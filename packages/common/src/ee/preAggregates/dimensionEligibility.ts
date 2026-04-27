import {
    getAllReferences,
    getParsedReference,
} from '../../compiler/exploreCompiler';
import type { CompiledTable } from '../../types/explore';
import type { CompiledDimension, FieldId } from '../../types/field';
import { getItemId } from '../../utils/item';

const USER_ATTRIBUTE_REFERENCE_PREFIXES = [
    '${ld.userAttributes.',
    '${lightdash.userAttributes.',
] as const;

export enum PreAggregateDerivedDimensionIneligibilityReason {
    CIRCULAR_DEPENDENCY = 'circular_dependency',
    COMPILATION_ERROR = 'compilation_error',
    MISSING_DEPENDENCY = 'missing_dependency',
    PARAMETER_REFERENCES = 'parameter_references',
    USER_ATTRIBUTES = 'user_attributes',
}

type PreAggregateDerivedDimensionEligibilityBase = {
    referencedDimensionFieldIds: FieldId[];
};

export type PreAggregateDerivedDimensionEligibility =
    | ({
          isEligible: true;
      } & PreAggregateDerivedDimensionEligibilityBase)
    | ({
          isEligible: false;
          ineligibleDimensionFieldId: FieldId;
          reason: PreAggregateDerivedDimensionIneligibilityReason;
      } & PreAggregateDerivedDimensionEligibilityBase);

type PreAggregateDimensionLookup = Record<
    string,
    Pick<CompiledTable, 'dimensions'>
>;

type EligibilityTraversalState = {
    activeFieldIds: Set<FieldId>;
    cache: Map<FieldId, PreAggregateDerivedDimensionEligibility>;
};

const mergeReferencedFieldIds = (
    current: FieldId[],
    next: FieldId[],
): FieldId[] => Array.from(new Set([...current, ...next]));

const hasParameterReferences = (dimension: CompiledDimension): boolean =>
    (dimension.parameterReferences?.length ?? 0) > 0;

const hasExplicitUserAttributeReference = (sql: string): boolean =>
    // There is no shared extractor for user-attribute references today, so keep
    // this first slice limited to explicit tokens we can detect cheaply.
    USER_ATTRIBUTE_REFERENCE_PREFIXES.some((prefix) => sql.includes(prefix));

const getReferencedDimension = ({
    dimension,
    ref,
    tables,
}: {
    dimension: CompiledDimension;
    ref: string;
    tables: PreAggregateDimensionLookup;
}): CompiledDimension | undefined => {
    if (ref === 'TABLE') {
        return undefined;
    }

    const { refTable, refName } = getParsedReference(ref, dimension.table);
    return tables[refTable]?.dimensions[refName];
};

const getIneligibleResult = ({
    fieldId,
    reason,
    referencedDimensionFieldIds,
}: {
    fieldId: FieldId;
    reason: PreAggregateDerivedDimensionIneligibilityReason;
    referencedDimensionFieldIds: FieldId[];
}): PreAggregateDerivedDimensionEligibility => ({
    isEligible: false,
    reason,
    ineligibleDimensionFieldId: fieldId,
    referencedDimensionFieldIds,
});

const analyzeDimensionEligibility = ({
    dimension,
    tables,
    state,
}: {
    dimension: CompiledDimension;
    tables: PreAggregateDimensionLookup;
    state: EligibilityTraversalState;
}): PreAggregateDerivedDimensionEligibility => {
    const currentFieldId = getItemId(dimension);
    const cachedResult = state.cache.get(currentFieldId);
    if (cachedResult) {
        return cachedResult;
    }

    if (state.activeFieldIds.has(currentFieldId)) {
        return getIneligibleResult({
            fieldId: currentFieldId,
            reason: PreAggregateDerivedDimensionIneligibilityReason.CIRCULAR_DEPENDENCY,
            referencedDimensionFieldIds: [currentFieldId],
        });
    }

    state.activeFieldIds.add(currentFieldId);

    let result: PreAggregateDerivedDimensionEligibility = {
        isEligible: true,
        referencedDimensionFieldIds: [currentFieldId],
    };

    try {
        if (dimension.compilationError) {
            result = getIneligibleResult({
                fieldId: currentFieldId,
                reason: PreAggregateDerivedDimensionIneligibilityReason.COMPILATION_ERROR,
                referencedDimensionFieldIds: [currentFieldId],
            });
            return result;
        }

        if (hasParameterReferences(dimension)) {
            result = getIneligibleResult({
                fieldId: currentFieldId,
                reason: PreAggregateDerivedDimensionIneligibilityReason.PARAMETER_REFERENCES,
                referencedDimensionFieldIds: [currentFieldId],
            });
            return result;
        }

        if (hasExplicitUserAttributeReference(dimension.sql)) {
            result = getIneligibleResult({
                fieldId: currentFieldId,
                reason: PreAggregateDerivedDimensionIneligibilityReason.USER_ATTRIBUTES,
                referencedDimensionFieldIds: [currentFieldId],
            });
            return result;
        }

        for (const ref of getAllReferences(dimension.sql)) {
            const referencedDimension = getReferencedDimension({
                dimension,
                ref,
                tables,
            });

            if (!referencedDimension) {
                if (ref === 'TABLE') {
                    // eslint-disable-next-line no-continue
                    continue;
                }

                result = getIneligibleResult({
                    fieldId: currentFieldId,
                    reason: PreAggregateDerivedDimensionIneligibilityReason.MISSING_DEPENDENCY,
                    referencedDimensionFieldIds:
                        result.referencedDimensionFieldIds,
                });
                return result;
            }

            const referencedDimensionEligibility = analyzeDimensionEligibility({
                dimension: referencedDimension,
                tables,
                state,
            });

            const referencedDimensionFieldIds = mergeReferencedFieldIds(
                result.referencedDimensionFieldIds,
                referencedDimensionEligibility.referencedDimensionFieldIds,
            );

            if (!referencedDimensionEligibility.isEligible) {
                result = {
                    ...referencedDimensionEligibility,
                    referencedDimensionFieldIds,
                };
                return result;
            }

            result = {
                isEligible: true,
                referencedDimensionFieldIds,
            };
        }

        return result;
    } finally {
        state.activeFieldIds.delete(currentFieldId);
        state.cache.set(currentFieldId, result);
    }
};

export const analyzePreAggregateDerivedDimensionEligibility = ({
    dimension,
    tables,
}: {
    dimension: CompiledDimension;
    tables: PreAggregateDimensionLookup;
}): PreAggregateDerivedDimensionEligibility =>
    analyzeDimensionEligibility({
        dimension,
        tables,
        state: {
            activeFieldIds: new Set<FieldId>(),
            cache: new Map<FieldId, PreAggregateDerivedDimensionEligibility>(),
        },
    });
