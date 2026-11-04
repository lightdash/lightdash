import {
    assertUnreachable,
    friendlyName,
    isField,
    type DashboardFilterableField,
    type LightdashProjectParameter,
} from '@lightdash/common';
import { getParameterLabel } from './parameterControlsBar';

/** Where a parameter is defined: on a model (`orders.region`), or for the
 * whole project (`fiscal_year_start`). */
export type ParameterSource =
    | { type: 'model'; modelName: string; modelLabel: string }
    | { type: 'project' };

/** One parameter a dashboard's tiles use, keyed as the project keys it. */
export type ParameterOption = {
    key: string;
    source: ParameterSource;
    definition: LightdashProjectParameter;
    /** The tiles that use it; a tile can use several parameters. */
    tileUuids: string[];
};

const PROJECT_GROUP_LABEL = 'Project';

/** The picker's group: a model's, or one for the project's parameters. */
export const getParameterGroup = (
    option: ParameterOption,
): { key: string; label: string } => {
    switch (option.source.type) {
        case 'model':
            return {
                key: `model:${option.source.modelName}`,
                label: option.source.modelLabel,
            };
        case 'project':
            return { key: 'project', label: PROJECT_GROUP_LABEL };
        default:
            return assertUnreachable(option.source, 'Unknown parameter source');
    }
};

/** "Orders Region": its group and label, as two models can share a label. */
export const getParameterName = (option: ParameterOption): string =>
    `${getParameterGroup(option).label} ${getParameterLabel(option)}`;

// A model's parameters are keyed `model.name`; its label is its table's
const getParameterSource = (
    key: string,
    fields: DashboardFilterableField[],
): ParameterSource => {
    const dot = key.indexOf('.');
    if (dot === -1) return { type: 'project' };
    const modelName = key.slice(0, dot);
    const tableField = fields.find(
        (field) => isField(field) && field.table === modelName,
    );
    return {
        type: 'model',
        modelName,
        modelLabel:
            tableField !== undefined && isField(tableField)
                ? tableField.tableLabel
                : friendlyName(modelName),
    };
};

/** Every parameter a tile uses that has a definition, one row each, with its tiles. */
export const getParameterOptions = ({
    definitions,
    tileParameterReferences,
    fields,
}: {
    definitions: Record<string, LightdashProjectParameter>;
    tileParameterReferences: Record<string, string[]>;
    fields: DashboardFilterableField[];
}): ParameterOption[] => {
    const tilesByKey = new Map<string, string[]>();
    Object.entries(tileParameterReferences).forEach(([tileUuid, keys]) =>
        new Set(keys).forEach((key) =>
            tilesByKey.set(key, [...(tilesByKey.get(key) ?? []), tileUuid]),
        ),
    );
    return [...tilesByKey].flatMap(([key, tileUuids]) => {
        const definition = definitions[key];
        return definition === undefined
            ? []
            : [
                  {
                      key,
                      source: getParameterSource(key, fields),
                      definition,
                      tileUuids,
                  },
              ];
    });
};
