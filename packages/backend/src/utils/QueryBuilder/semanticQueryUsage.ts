import {
    getFilterRules,
    getItemId,
    isCustomDimension,
    isField,
    type Explore,
    type ItemsMap,
    type MetricQuery,
    type SemanticFieldReference,
    type SemanticQueryUsage,
} from '@lightdash/common';
import { createHash } from 'crypto';

// Bound telemetry independently of query size. Partial capture stays visible.
export const MAX_SEMANTIC_REFERENCES = 500;
const MAX_REFERENCES_BYTES = 64 * 1024;

/** No SQL, filter values or result data leave this function. No I/O. */
export const buildSemanticQueryUsage = (
    query: MetricQuery,
    explore: Explore,
    selectedFields: ItemsMap,
): SemanticQueryUsage => {
    try {
        const references: SemanticFieldReference[] = [];
        const seen = new Set<string>();
        const metadata = new Map<
            string,
            Omit<SemanticFieldReference, 'role'> | undefined
        >();
        const customIds = new Set([
            ...(query.additionalMetrics ?? []).map(getItemId),
            ...(query.customDimensions ?? []).map(getItemId),
        ]);
        let status: SemanticQueryUsage['status'] = 'captured';
        let bytes = 2;
        const add = (fieldId: string, role: SemanticFieldReference['role']) => {
            const key = `${fieldId}:${role}`;
            if (seen.has(key)) return;
            if (seen.size >= MAX_SEMANTIC_REFERENCES) {
                status = 'partial';
                return;
            }
            seen.add(key);
            if (!metadata.has(fieldId)) {
                let field = selectedFields[fieldId];
                // Filter-only fields aren't in the result columns. Resolve only
                // referenced fields, without constructing a map of every field.
                if (!field) {
                    for (const table of Object.values(explore.tables)) {
                        const prefix = `${table.name}_`;
                        if (fieldId.startsWith(prefix)) {
                            const name = fieldId.slice(prefix.length);
                            field =
                                table.dimensions[name] ?? table.metrics[name];
                            if (field) break;
                        }
                    }
                }
                if (!isField(field) && !isCustomDimension(field)) {
                    // Table calculations/raw SQL do not establish semantic lineage.
                    status = 'partial';
                    metadata.set(fieldId, undefined);
                    return;
                }
                const custom =
                    customIds.has(fieldId) || isCustomDimension(field);
                const definition = isField(field)
                    ? {
                          type: field.type,
                          sql: field.sql,
                          filters:
                              'filters' in field ? field.filters : undefined,
                      }
                    : field;
                metadata.set(fieldId, {
                    fieldId,
                    fieldName: field.name,
                    tableName: field.table,
                    fieldLabel: (isField(field)
                        ? field.label
                        : field.name
                    ).slice(0, 512),
                    fieldKind:
                        isField(field) && field.fieldType === 'metric'
                            ? 'metric'
                            : 'dimension',
                    fieldOrigin: custom ? 'custom' : 'model',
                    definitionHash: createHash('sha256')
                        .update(JSON.stringify(definition))
                        .digest('hex'),
                });
            }
            const info = metadata.get(fieldId);
            if (!info) return;
            const reference = { ...info, role };
            const size = Buffer.byteLength(JSON.stringify(reference)) + 1;
            if (bytes + size > MAX_REFERENCES_BYTES) {
                status = 'partial';
                return;
            }
            bytes += size;
            references.push(reference);
        };
        query.metrics.forEach((id) => add(id, 'selected'));
        query.dimensions.forEach((id) => {
            add(id, 'selected');
            add(id, 'group');
        });
        getFilterRules(query.filters).forEach(({ target }) =>
            add(target.fieldId, 'filter'),
        );
        query.sorts.forEach(({ fieldId }) => add(fieldId, 'sort'));
        return { status, references };
    } catch {
        // Optional telemetry must never prevent a query from running.
        return { status: 'unavailable', references: [] };
    }
};
