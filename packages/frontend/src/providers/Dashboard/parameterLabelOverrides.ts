import { type LanguageMap, type ParameterDefinitions } from '@lightdash/common';

export type ParameterLabelOverrides = LanguageMap['parameters'];

export const applyParameterLabelOverrides = (
    parameterDefinitions: ParameterDefinitions,
    overrides: ParameterLabelOverrides,
): ParameterDefinitions => {
    if (!overrides) return parameterDefinitions;

    let translatedDefinitions: ParameterDefinitions | undefined;

    Object.entries(parameterDefinitions).forEach(([name, definition]) => {
        const override = overrides[name];
        const translatedLabel =
            override && typeof override.label === 'string'
                ? override.label
                : undefined;

        if (!translatedLabel || translatedLabel === definition.label) {
            return;
        }

        translatedDefinitions ??= { ...parameterDefinitions };
        translatedDefinitions[name] = {
            ...definition,
            label: translatedLabel,
        };
    });

    return translatedDefinitions ?? parameterDefinitions;
};
