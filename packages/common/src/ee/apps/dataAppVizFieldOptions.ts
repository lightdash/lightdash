import {
    type DataAppVizFieldMapping,
    type DataAppVizFieldOptionValues,
} from '../../types/savedCharts';
import { getDataAppVizFieldIds } from './dataAppVizFieldMapping';
import {
    getEffectiveOptionValues,
    pruneDataAppVizOptionValues,
    type DataAppVizContext,
    type DataAppVizField,
} from './types';

/**
 * The stored per-field values that still fit the contract and binding: fields
 * no longer bound, options no longer declared and mistyped values go.
 */
export const pruneDataAppVizFieldOptionValues = (
    fields: DataAppVizField[],
    fieldMapping: DataAppVizFieldMapping,
    fieldOptionValues: DataAppVizFieldOptionValues,
): DataAppVizFieldOptionValues =>
    Object.fromEntries(
        fields.flatMap((field) => {
            const kept = Object.fromEntries(
                getDataAppVizFieldIds(fieldMapping[field.name]).flatMap(
                    (fieldId) => {
                        const values = pruneDataAppVizOptionValues(
                            field.configOptions ?? [],
                            fieldOptionValues[field.name]?.[fieldId] ?? {},
                        );
                        return Object.keys(values).length > 0
                            ? [[fieldId, values] as const]
                            : [];
                    },
                ),
            );
            return Object.keys(kept).length > 0
                ? [[field.name, kept] as const]
                : [];
        }),
    );

/**
 * Effective per-field values (stored value, else declared default) for every
 * field bound to an input that declares options.
 */
export const getDataAppVizFieldOptions = (
    fields: DataAppVizField[],
    fieldMapping: DataAppVizFieldMapping,
    fieldOptionValues: DataAppVizFieldOptionValues,
): DataAppVizContext['fieldOptions'] =>
    Object.fromEntries(
        fields
            .filter((field) => (field.configOptions ?? []).length > 0)
            .map((field) => [
                field.name,
                Object.fromEntries(
                    getDataAppVizFieldIds(fieldMapping[field.name]).map(
                        (fieldId) => [
                            fieldId,
                            getEffectiveOptionValues(
                                field.configOptions ?? [],
                                fieldOptionValues[field.name]?.[fieldId] ?? {},
                            ),
                        ],
                    ),
                ),
            ]),
    );
