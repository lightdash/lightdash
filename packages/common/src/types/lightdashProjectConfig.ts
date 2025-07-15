type SpotlightCategory = {
    label: string;
    color?: string;
};

type SpotlightConfig = {
    default_visibility: 'show' | 'hide';
    categories?: {
        [yaml_reference: string]: SpotlightCategory;
    };
};

type LightdashParameter = {
    label: string;
    description?: string;
    options?: string[];
};

export type LightdashProjectConfig = {
    spotlight: SpotlightConfig;
    parameters?: Record<string, LightdashParameter>; // keys must be ^[a-zA-Z0-9_-]+$
};

export const DEFAULT_SPOTLIGHT_CONFIG: SpotlightConfig = {
    default_visibility: 'show',
};
