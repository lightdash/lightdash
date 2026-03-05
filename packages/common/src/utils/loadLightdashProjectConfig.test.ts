import { LightdashProjectConfigError, ParseError } from '../types/errors';
import { loadLightdashProjectConfig } from './loadLightdashProjectConfig';
import {
    configWithEmptyOptionsArray,
    emptyConfig,
    invalidConfigCustomGranularityConflictsWithTimeFrames,
    invalidConfigCustomGranularityNoLabel,
    invalidConfigCustomGranularityNoSql,
    invalidConfigWithAllowCustomValuesFalse,
    invalidConfigWithIncompleteOptionsFromDimension,
    invalidConfigWithNoOptions,
    validConfigWithAllowCustomValues,
    validConfigWithCustomGranularities,
    validConfigWithDateParameter,
    validConfigWithDateParameterFromDimension,
    validConfigWithMixedArrayTypes,
    validConfigWithNumberArrayParameter,
    validConfigWithNumberParameter,
    validConfigWithOptionsFromDimension,
    validConfigWithoutCustomGranularities,
    validConfigWithParameters,
    validConfigWithStringTypeExplicit,
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

    it('should load a valid config with number parameter', async () => {
        const config = await loadLightdashProjectConfig(
            validConfigWithNumberParameter,
        );
        expect(config).toEqual({
            spotlight: {
                default_visibility: 'show',
            },
            parameters: {
                customer_id: {
                    label: 'Customer ID',
                    type: 'number',
                    default: 100,
                    options: [100, 200, 300],
                },
            },
        });
    });

    it('should load a valid config with number array parameter', async () => {
        const config = await loadLightdashProjectConfig(
            validConfigWithNumberArrayParameter,
        );
        expect(config).toEqual({
            spotlight: {
                default_visibility: 'show',
            },
            parameters: {
                product_ids: {
                    label: 'Product IDs',
                    type: 'number',
                    multiple: true,
                    default: [1, 2, 3],
                    options: [1, 2, 3, 4, 5],
                },
            },
        });
    });

    it('should load a valid config with explicit string type', async () => {
        const config = await loadLightdashProjectConfig(
            validConfigWithStringTypeExplicit,
        );
        expect(config).toEqual({
            spotlight: {
                default_visibility: 'show',
            },
            parameters: {
                status: {
                    label: 'Status',
                    type: 'string',
                    default: 'active',
                    options: ['active', 'inactive', 'pending'],
                },
            },
        });
    });

    it('should load a valid config with string array parameter', async () => {
        const config = await loadLightdashProjectConfig(
            validConfigWithMixedArrayTypes,
        );
        expect(config).toEqual({
            spotlight: {
                default_visibility: 'show',
            },
            parameters: {
                customer_name: {
                    label: 'Customer Name',
                    type: 'string',
                    multiple: true,
                    default: ['John', 'Jane'],
                    options: ['John', 'Jane', 'Bob', 'Alice'],
                },
            },
        });
    });

    it('should load a valid config with date parameter', async () => {
        const config = await loadLightdashProjectConfig(
            validConfigWithDateParameter,
        );
        expect(config).toEqual({
            spotlight: {
                default_visibility: 'show',
            },
            parameters: {
                start_date: {
                    label: 'Start Date',
                    type: 'date',
                    default: '2025-08-06',
                    options: ['2025-08-06', '2025-08-07', '2025-08-08'],
                },
            },
        });
    });

    it('should load a valid config with date parameter using options_from_dimension', async () => {
        const config = await loadLightdashProjectConfig(
            validConfigWithDateParameterFromDimension,
        );
        expect(config).toEqual({
            spotlight: {
                default_visibility: 'show',
            },
            parameters: {
                order_date: {
                    label: 'Order Date',
                    type: 'date',
                    options_from_dimension: {
                        model: 'orders',
                        dimension: 'order_date',
                    },
                },
            },
        });
    });

    it('should load config with custom_granularities', async () => {
        const config = await loadLightdashProjectConfig(
            validConfigWithCustomGranularities,
        );
        expect(config.custom_granularities).toBeDefined();
        expect(config.custom_granularities!.slt_week.label).toBe('SLT Week');
        expect(config.custom_granularities!.slt_week.type).toBeUndefined();
        expect(config.custom_granularities!.fiscal_quarter.type).toBe('string');
    });

    it('should reject custom_granularity without sql', async () => {
        await expect(
            loadLightdashProjectConfig(invalidConfigCustomGranularityNoSql),
        ).rejects.toThrow(ParseError);
    });

    it('should reject custom_granularity without label', async () => {
        await expect(
            loadLightdashProjectConfig(invalidConfigCustomGranularityNoLabel),
        ).rejects.toThrow(ParseError);
    });

    it('should reject custom_granularity that conflicts with standard TimeFrames', async () => {
        await expect(
            loadLightdashProjectConfig(
                invalidConfigCustomGranularityConflictsWithTimeFrames,
            ),
        ).rejects.toThrow(/conflict.*standard time intervals/i);
    });

    it('should reject custom_granularity that conflicts with standard TimeFrames with correct error type', async () => {
        await expect(
            loadLightdashProjectConfig(
                invalidConfigCustomGranularityConflictsWithTimeFrames,
            ),
        ).rejects.toThrow(LightdashProjectConfigError);
    });

    it('should load config without custom_granularities', async () => {
        const config = await loadLightdashProjectConfig(
            validConfigWithoutCustomGranularities,
        );
        expect(config.custom_granularities).toBeUndefined();
    });
});
