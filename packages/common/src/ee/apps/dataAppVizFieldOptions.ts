import {
    type DataAppVizFieldMapping,
    type DataAppVizFieldOptionValues,
} from '../../types/savedCharts';
import { getDataAppVizFieldIds } from './dataAppVizFieldMapping';
import {
    getEffectiveOptionValues,
    pruneDataAppVizOptionValues,
    type DataAppVizField,
} from './types';

const boundIds = (binding: string | string[] | undefined): string[] =>
    getDataAppVizFieldIds(binding).filter((fieldId) => fieldId.length > 0);

/** Keep only explicit values for fields and options still in the contract. */
export const pruneDataAppVizFieldOptionValues = (
    fields: DataAppVizField[],
    fieldMapping: DataAppVizFieldMapping,
    values: DataAppVizFieldOptionValues = {},
): DataAppVizFieldOptionValues =>
    Object.fromEntries(
        fields.flatMap((field) => {
            const options = field.configOptions ?? [];
            if (options.length === 0) return [];
            const byId = Object.fromEntries(
                boundIds(fieldMapping[field.name]).flatMap((fieldId) => {
                    const explicit = pruneDataAppVizOptionValues(
                        options,
                        values[field.name]?.[fieldId] ?? {},
                    );
                    return Object.keys(explicit).length > 0
                        ? [[fieldId, explicit]]
                        : [];
                }),
            );
            return Object.keys(byId).length > 0 ? [[field.name, byId]] : [];
        }),
    );

/** Resolve declared defaults independently for every currently bound field. */
export const getEffectiveDataAppVizFieldOptionValues = (
    fields: DataAppVizField[],
    fieldMapping: DataAppVizFieldMapping,
    values: DataAppVizFieldOptionValues = {},
): DataAppVizFieldOptionValues =>
    Object.fromEntries(
        fields.flatMap((field) => {
            const options = field.configOptions ?? [];
            if (options.length === 0) return [];
            const byId = Object.fromEntries(
                boundIds(fieldMapping[field.name]).map((fieldId) => [
                    fieldId,
                    getEffectiveOptionValues(
                        options,
                        values[field.name]?.[fieldId] ?? {},
                    ),
                ]),
            );
            return Object.keys(byId).length > 0 ? [[field.name, byId]] : [];
        }),
    );
