import { type LightdashProjectParameter } from '../types/lightdashProjectConfig';
import {
    type ParameterDefinitions,
    type ParametersValuesMap,
    type ParameterValue,
} from '../types/parameters';
import { resolveParameterDefault } from './parameterDefaults';
import { omitDisallowedParameterValues } from './parameterOptions';

/** Where a parameter is defined: the project's lightdash.config.yml, or a dbt model */
export type ContentParameterSource = 'project' | 'model';

/** A parameter a saved chart or dashboard uses, with what an integration needs to offer it */
export type ContentParameter = {
    name: string;
    config: LightdashProjectParameter;
    /** The value saved on the chart or dashboard, else the definition's default; null when neither */
    currentValue: ParameterValue | null;
    source: ContentParameterSource;
};

export type DashboardContentParameter = ContentParameter & {
    /** The dashboard tiles whose queries use this parameter */
    tileUuids: string[];
};

export type ApiChartParametersResponse = {
    status: 'ok';
    results: ContentParameter[];
};

export type ApiDashboardParametersResponse = {
    status: 'ok';
    results: DashboardContentParameter[];
};

/**
 * The parameters a chart or dashboard uses, in reference order. A reference
 * with no definition is left out: nothing can be offered for it.
 */
export const getContentParameters = ({
    parameterReferences,
    definitions,
    projectDefinitions,
    savedValues,
    now = new Date(),
    timezone,
}: {
    parameterReferences: string[];
    /** Project and model definitions merged, model winning */
    definitions: ParameterDefinitions;
    projectDefinitions: ParameterDefinitions;
    savedValues: ParametersValuesMap;
    now?: Date;
    timezone?: string;
}): ContentParameter[] => {
    // A saved value outside a parameter's fixed options counts as unset
    const allowedSavedValues = omitDisallowedParameterValues(
        savedValues,
        definitions,
    );
    return [...new Set(parameterReferences)].flatMap((name) => {
        const config = definitions[name];
        if (!config) return [];
        const projectConfig = projectDefinitions[name];
        return [
            {
                name,
                config,
                currentValue:
                    allowedSavedValues[name] ??
                    resolveParameterDefault(config, now, timezone) ??
                    null,
                source:
                    projectConfig !== undefined && projectConfig === config
                        ? 'project'
                        : 'model',
            },
        ];
    });
};
