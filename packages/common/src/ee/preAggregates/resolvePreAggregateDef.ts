import { ParameterError } from '../../types/errors';
import type { Explore } from '../../types/explore';
import {
    convertFieldRefToFieldId,
    type CompiledDimension,
    type FieldId,
} from '../../types/field';
import type { ModelRequiredFilterRule } from '../../types/filter';
import type { PreAggregateDef } from '../../types/preAggregate';
import { getItemId } from '../../utils/item';
import { getDimensionBaseName, getDimensionReferences } from './references';

export type RequiredFilterDeferral = {
    /** The required_filter_dimensions entry that selected this rule. */
    entry: string;
    rule: ModelRequiredFilterRule;
    /** Field id of the rule's target dimension (may be a granularity sibling). */
    targetFieldId: FieldId;
    targetDimension: CompiledDimension;
};

const isTimeIntervalFamilyDimension = (
    dimension: CompiledDimension,
    sourceExplore: Explore,
): boolean =>
    dimension.isIntervalBase === true ||
    dimension.timeInterval !== undefined ||
    Object.values(sourceExplore.tables[dimension.table]?.dimensions ?? {}).some(
        (candidate) =>
            candidate.timeIntervalBaseDimensionName === dimension.name,
    );

const getDimensionsByFieldId = (
    sourceExplore: Explore,
): Map<FieldId, CompiledDimension> => {
    const dimensionsByFieldId = new Map<FieldId, CompiledDimension>();
    Object.values(sourceExplore.tables).forEach((table) => {
        Object.values(table.dimensions).forEach((dimension) => {
            dimensionsByFieldId.set(getItemId(dimension), dimension);
        });
    });
    return dimensionsByFieldId;
};

const matchRequiredFilterRulesForEntry = ({
    entry,
    rules,
    sourceExplore,
    dimensionsByFieldId,
}: {
    entry: string;
    rules: ModelRequiredFilterRule[];
    sourceExplore: Explore;
    dimensionsByFieldId: Map<FieldId, CompiledDimension>;
}): RequiredFilterDeferral[] =>
    rules.flatMap<RequiredFilterDeferral>((rule) => {
        const targetFieldId = convertFieldRefToFieldId(
            rule.target.fieldRef,
            sourceExplore.tables[sourceExplore.baseTable].name,
        );
        const targetDimension = dimensionsByFieldId.get(targetFieldId);
        if (!targetDimension) {
            return [];
        }

        // Per-base matching: granularity siblings collapse to base-name
        // references, so an entry names the base dimension of the rule target.
        const targetReferences = getDimensionReferences({
            dimension: targetDimension,
            baseTable: sourceExplore.baseTable,
        });
        return targetReferences.includes(entry)
            ? [{ entry, rule, targetFieldId, targetDimension }]
            : [];
    });

/**
 * Resolves required_filter_dimensions entries to the required model filter
 * rules they defer. Lenient by design: entries that do not resolve are skipped,
 * so the matcher and the materialization payload builder always partition
 * required filters identically. resolvePreAggregateDef enforces validity at
 * explore-generation time, before a definition can be persisted or matched.
 */
export const resolveRequiredFilterDeferrals = ({
    sourceExplore,
    preAggregateDef,
}: {
    sourceExplore: Explore;
    preAggregateDef: PreAggregateDef;
}): RequiredFilterDeferral[] => {
    const entries = preAggregateDef.requiredFilterDimensions ?? [];
    if (entries.length === 0) {
        return [];
    }

    const baseTable = sourceExplore.tables[sourceExplore.baseTable];
    if (!baseTable) {
        return [];
    }

    const requiredRules = (baseTable.requiredFilters ?? []).filter(
        (rule) => rule.required !== false,
    );
    if (requiredRules.length === 0) {
        return [];
    }

    const dimensionsByFieldId = getDimensionsByFieldId(sourceExplore);

    return entries.flatMap((entry) =>
        matchRequiredFilterRulesForEntry({
            entry,
            rules: requiredRules,
            sourceExplore,
            dimensionsByFieldId,
        }),
    );
};

/**
 * Returns the effective definition for a parsed pre-aggregate: every
 * required_filter_dimensions entry is validated against the compiled explore,
 * non-time targets are unioned into the definition's dimensions (so the rollup
 * read path can re-apply the deferred filter), and time targets are reconciled
 * against the configured time dimension at strictly equal granularity. The
 * result is idempotent — resolving an effective definition returns it as-is.
 * Throws on invalid entries; generatePreAggregateExplores turns the throw into
 * an explore warning and excludes the definition, so it can never match.
 */
export const resolvePreAggregateDef = ({
    sourceExplore,
    preAggregateDef,
}: {
    sourceExplore: Explore;
    preAggregateDef: PreAggregateDef;
}): PreAggregateDef => {
    const entries = preAggregateDef.requiredFilterDimensions ?? [];
    if (entries.length === 0) {
        return preAggregateDef;
    }

    const baseTable = sourceExplore.tables[sourceExplore.baseTable];
    if (!baseTable) {
        throw new ParameterError(
            `Pre-aggregate "${preAggregateDef.name}" cannot resolve "required_filter_dimensions": base table "${sourceExplore.baseTable}" was not found`,
        );
    }

    const dimensionsByFieldId = getDimensionsByFieldId(sourceExplore);
    const knownDimensionReferences = new Set(
        Array.from(dimensionsByFieldId.values()).flatMap((dimension) =>
            getDimensionReferences({
                dimension,
                baseTable: sourceExplore.baseTable,
            }),
        ),
    );
    const deferrals = resolveRequiredFilterDeferrals({
        sourceExplore,
        preAggregateDef,
    });

    const dimensionsToUnion: string[] = [];

    entries.forEach((entry) => {
        const entryDeferrals = deferrals.filter(
            (deferral) => deferral.entry === entry,
        );

        if (entryDeferrals.length === 0) {
            if (!knownDimensionReferences.has(entry)) {
                throw new ParameterError(
                    `Pre-aggregate "${preAggregateDef.name}" references unknown dimension "${entry}" in "required_filter_dimensions"`,
                );
            }

            const matchesRequiredFalseRule =
                matchRequiredFilterRulesForEntry({
                    entry,
                    rules: (baseTable.requiredFilters ?? []).filter(
                        (rule) => rule.required === false,
                    ),
                    sourceExplore,
                    dimensionsByFieldId,
                }).length > 0;
            if (matchesRequiredFalseRule) {
                throw new ParameterError(
                    `Pre-aggregate "${preAggregateDef.name}" required_filter_dimensions entry "${entry}" targets a filter with "required: false", which is never enforced — there is nothing to defer`,
                );
            }

            throw new ParameterError(
                `Pre-aggregate "${preAggregateDef.name}" required_filter_dimensions entry "${entry}" does not match any required filter on the model`,
            );
        }

        entryDeferrals.forEach(({ rule, targetDimension }) => {
            if (isTimeIntervalFamilyDimension(targetDimension, sourceExplore)) {
                if (
                    !preAggregateDef.timeDimension ||
                    !preAggregateDef.granularity
                ) {
                    throw new ParameterError(
                        `Pre-aggregate "${preAggregateDef.name}" cannot defer the time-based required filter on "${entry}" without "time_dimension" and "granularity"`,
                    );
                }
                if (
                    getDimensionBaseName(targetDimension) !==
                    preAggregateDef.timeDimension
                ) {
                    throw new ParameterError(
                        `Pre-aggregate "${preAggregateDef.name}" can only defer time-based required filters on its time dimension "${preAggregateDef.timeDimension}", but "${entry}" targets a different time dimension`,
                    );
                }
                if (targetDimension.timeInterval === undefined) {
                    throw new ParameterError(
                        `Pre-aggregate "${preAggregateDef.name}" cannot defer the required filter on "${rule.target.fieldRef}": it targets the raw time dimension. Point the required filter at "${getDimensionBaseName(
                            targetDimension,
                        )}_${preAggregateDef.granularity.toLowerCase()}" or align the granularities`,
                    );
                }
                if (
                    targetDimension.timeInterval !== preAggregateDef.granularity
                ) {
                    throw new ParameterError(
                        `Pre-aggregate "${preAggregateDef.name}" cannot defer the required filter on "${rule.target.fieldRef}": it uses ${targetDimension.timeInterval} granularity but the pre-aggregate materializes ${preAggregateDef.granularity}. Align the granularities to defer it`,
                    );
                }
                return;
            }

            const targetReferences = getDimensionReferences({
                dimension: targetDimension,
                baseTable: sourceExplore.baseTable,
            });
            const alreadyDeclared = targetReferences.some(
                (reference) =>
                    preAggregateDef.dimensions.includes(reference) ||
                    dimensionsToUnion.includes(reference),
            );
            if (!alreadyDeclared) {
                dimensionsToUnion.push(entry);
            }
        });
    });

    if (dimensionsToUnion.length === 0) {
        return preAggregateDef;
    }

    return {
        ...preAggregateDef,
        dimensions: [...preAggregateDef.dimensions, ...dimensionsToUnion],
    };
};
