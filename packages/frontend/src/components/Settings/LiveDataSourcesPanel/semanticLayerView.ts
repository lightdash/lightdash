import {
    getItemId,
    type ApiExploreResults,
    type FilterOperator,
} from '@lightdash/common';
import { dump } from 'js-yaml';

export type SemanticLayerField = {
    name: string;
    label: string;
    kind: 'dimension' | 'metric';
    type: string;
    /** The integration's own name for the field. */
    apiName: string;
    filterOperators: FilterOperator[];
    description: string | null;
};

/** The fields a live data source explore offers, dimensions first. */
export const getSemanticLayerFields = (
    explore: ApiExploreResults,
): SemanticLayerField[] => {
    const table = explore.tables[explore.baseTable];
    const rules = explore.apiSource?.fields ?? {};
    const toField = (
        kind: SemanticLayerField['kind'],
        field:
            | (typeof table.dimensions)[string]
            | (typeof table.metrics)[string],
    ): SemanticLayerField => {
        const rule = rules[getItemId(field)];
        return {
            name: field.name,
            label: field.label,
            kind,
            type: field.type,
            apiName: rule?.apiName ?? field.name,
            filterOperators: rule?.filterOperators ?? [],
            description: field.description ?? null,
        };
    };
    return [
        ...Object.values(table.dimensions)
            .filter(({ hidden }) => !hidden)
            .map((dimension) => toField('dimension', dimension)),
        ...Object.values(table.metrics)
            .filter(({ hidden }) => !hidden)
            .map((metric) => toField('metric', metric)),
    ];
};

/** The semantic layer as YAML, read-only: the same rules the query compiler enforces. */
export const toSemanticLayerYaml = (explores: ApiExploreResults[]): string =>
    dump(
        explores.map((explore) => {
            const fields = getSemanticLayerFields(explore);
            const toYamlField = ({
                name,
                label,
                type,
                apiName,
                filterOperators,
                description,
            }: SemanticLayerField) => ({
                name,
                label,
                type,
                api_name: apiName,
                ...(description ? { description } : {}),
                filters: filterOperators,
            });
            const apiSource = explore.apiSource;
            return {
                explore: explore.name,
                label: explore.label,
                ...(explore.tables[explore.baseTable].description
                    ? {
                          description:
                              explore.tables[explore.baseTable].description,
                      }
                    : {}),
                ...(apiSource
                    ? {
                          base_version: apiSource.baseVersion,
                          rules: {
                              or_filters: apiSource.filterGroups.or,
                              nested_filters: apiSource.filterGroups.nested,
                              max_dimensions: apiSource.maxDimensions,
                              max_metrics: apiSource.maxMetrics,
                              default_date_range: apiSource.dateRange
                                  ? {
                                        field: apiSource.dateRange.fieldId,
                                        days: apiSource.dateRange.defaultDays,
                                    }
                                  : null,
                          },
                      }
                    : {}),
                dimensions: fields
                    .filter(({ kind }) => kind === 'dimension')
                    .map(toYamlField),
                metrics: fields
                    .filter(({ kind }) => kind === 'metric')
                    .map(toYamlField),
                ...(apiSource && apiSource.incompatible.length > 0
                    ? { incompatible: apiSource.incompatible }
                    : {}),
            };
        }),
        { lineWidth: 100, noRefs: true },
    );
