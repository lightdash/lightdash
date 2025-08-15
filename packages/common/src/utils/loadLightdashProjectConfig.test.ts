import { ParseError } from '../types/errors';
import { loadLightdashProjectConfig } from './loadLightdashProjectConfig';
import {
    configWithEmptyOptionsArray,
    emptyConfig,
    invalidConfigWithAllowCustomValuesFalse,
    invalidConfigWithIncompleteOptionsFromDimension,
    invalidConfigWithNoOptions,
    validConfigWithAllowCustomValues,
    validConfigWithOptionsFromDimension,
    validConfigWithParameters,
} from './loadLightdashProjectConfig.mock';

describe('loadLightdashProjectConfig', () => {
    it('should load an empty config', async () => {
        const config = await loadLightdashProjectConfig(emptyConfig);
        expect(config).toEqual({
            spotlight: {
                default_visibility: 'show',
            },
        });
    });

    it('should load a valid config with parameters', async () => {
        const config = await loadLightdashProjectConfig(
            validConfigWithParameters,
        );
        expect(config).toEqual({
            spotlight: {
                default_visibility: 'show',
            },
            parameters: {
                test_param: {
                    label: 'Test Parameter',
                    options: ['option1', 'option2'],
                },
            },
        });
    });

    it('should load a valid config with parameters using options_from_dimension', async () => {
        const config = await loadLightdashProjectConfig(
            validConfigWithOptionsFromDimension,
        );
        expect(config).toEqual({
            spotlight: {
                default_visibility: 'show',
            },
            parameters: {
                test_param: {
                    label: 'Test Parameter',
                    options_from_dimension: {
                        model: 'test_model',
                        dimension: 'test_dimension',
                    },
                },
            },
        });
    });

    it('should load a valid config with parameters using allow_custom_values', async () => {
        const config = await loadLightdashProjectConfig(
            validConfigWithAllowCustomValues,
        );
        expect(config).toEqual({
            spotlight: {
                default_visibility: 'show',
            },
            parameters: {
                test_param: {
                    label: 'Test Parameter',
                    allow_custom_values: true,
                },
            },
        });
    });

    it('should throw an error for invalid parameter with no options', async () => {
        await expect(
            loadLightdashProjectConfig(invalidConfigWithNoOptions),
        ).rejects.toThrow(ParseError);
    });

    it('should throw an error for invalid parameter with allow_custom_values set to false', async () => {
        await expect(
            loadLightdashProjectConfig(invalidConfigWithAllowCustomValuesFalse),
        ).rejects.toThrow(ParseError);
    });

    it('should throw an error for parameter with empty options array', async () => {
        await expect(
            loadLightdashProjectConfig(configWithEmptyOptionsArray),
        ).rejects.toThrow(ParseError);
    });

    it('should throw an error for invalid parameter with incomplete options_from_dimension', async () => {
        await expect(
            loadLightdashProjectConfig(
                invalidConfigWithIncompleteOptionsFromDimension,
            ),
        ).rejects.toThrow(ParseError);
    });
});
