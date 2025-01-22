type SpotlightConfig = {
    default_visibility?: 'show' | 'hide';
};

export type LightdashProjectConfig = {
    spotlight?: SpotlightConfig;
};

export const DEFAULT_SPOTLIGHT_CONFIG: Required<SpotlightConfig> = {
    default_visibility: 'show',
};
