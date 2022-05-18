import { LightdashMode } from '@lightdash/common';

export const UNDEFINED_CONFIG = undefined;

export const EMPTY_CONFIG = {};

export const BASIC_CONFIG = {
    version: '1.0',
    mode: LightdashMode.DEFAULT,
};

export const WRONG_VERSION = {
    ...BASIC_CONFIG,
    version: 1.1,
};
