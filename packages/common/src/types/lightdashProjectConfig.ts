type SpotlightCategory = {
    label: string;
    color?: string;
};

type SpotlightConfig = {
    default_visibility?: 'show' | 'hide';
    categories?: Record<string, SpotlightCategory>;
};

export type LightdashProjectConfig = {
    spotlight?: SpotlightConfig;
};

export const DEFAULT_SPOTLIGHT_CONFIG: Required<SpotlightConfig> = {
    default_visibility: 'show',
    categories: {},
};
