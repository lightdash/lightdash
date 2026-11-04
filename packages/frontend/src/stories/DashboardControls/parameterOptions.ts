import {
    assertUnreachable,
    type LightdashProjectParameter,
    type ParameterValue,
} from '@lightdash/common';
import { CONTROL_STRINGS } from './controlStrings';

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

/** A parameter control on the bar: one value for every parameter it sets. */
export type ParameterControl = {
    id: string;
    label: string | null;
    parameters: ParameterOption[];
    /** The tiles it sets; empty for a second control on a parameter. */
    tileUuids: string[];
    /** Its section on the bar, its one setting; null for none. */
    sectionId: string | null;
    value: ParameterValue | null;
};

/** Its label, or its key when it has none, as the shipped picker shows it. */
export const getParameterLabel = (option: ParameterOption): string =>
    option.definition.label || option.key;

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
            return { key: 'project', label: CONTROL_STRINGS.projectGroup };
        default:
            return assertUnreachable(option.source, 'Unknown parameter source');
    }
};

/** "Orders Region": its group and label, as two models can share a label. */
export const getParameterName = (option: ParameterOption): string =>
    `${getParameterGroup(option).label} ${getParameterLabel(option)}`;
