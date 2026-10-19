import {
    WarehouseTypes,
    type CreateWarehouseCredentials,
} from '../types/projects';
import {
    formatEstimatedBytes,
    getAgentEstimateExceededMessage,
    getQueryCostEstimateSettings,
} from './queryCostEstimate';
import { isWarehouseResourceLimitError } from './warehouseResourceLimits';

const bigquery = {
    type: WarehouseTypes.BIGQUERY,
    project: 'p',
    dataset: 'd',
    timeoutSeconds: undefined,
    priority: undefined,
    keyfileContents: {},
    retries: undefined,
    location: undefined,
    maximumBytesBilled: undefined,
} satisfies CreateWarehouseCredentials;

describe('getQueryCostEstimateSettings', () => {
    it('is null for warehouses without a dry run', () => {
        expect(
            getQueryCostEstimateSettings({
                type: WarehouseTypes.POSTGRES,
            } as CreateWarehouseCredentials),
        ).toBeNull();
    });

    it('is off by default for BigQuery', () => {
        expect(getQueryCostEstimateSettings(bigquery)).toEqual({
            estimateQueryBytes: false,
            confirmEstimatedBytesAbove: null,
            agentMaximumEstimatedBytes: null,
        });
    });

    it('treats zero and invalid limits as unset', () => {
        expect(
            getQueryCostEstimateSettings({
                ...bigquery,
                estimateQueryBytes: true,
                confirmEstimatedBytesAbove: 0,
                agentMaximumEstimatedBytes: Number.NaN,
            }),
        ).toEqual({
            estimateQueryBytes: true,
            confirmEstimatedBytesAbove: null,
            agentMaximumEstimatedBytes: null,
        });
        expect(
            getQueryCostEstimateSettings({
                ...bigquery,
                agentMaximumEstimatedBytes: 10_000_000_000,
            })?.agentMaximumEstimatedBytes,
        ).toBe(10_000_000_000);
    });
});

describe('formatEstimatedBytes', () => {
    it.each([
        [0, '0 B'],
        [999, '999 B'],
        [1_500, '1.5 KB'],
        [123_456_789, '123 MB'],
        [10_000_000_000, '10 GB'],
        [2_340_000_000_000, '2.3 TB'],
    ])('formats %d as %s', (bytes, expected) => {
        expect(formatEstimatedBytes(bytes)).toBe(expected);
    });
});

describe('getAgentEstimateExceededMessage', () => {
    it('includes the estimate and is classified as a resource limit', () => {
        const message = getAgentEstimateExceededMessage({
            estimatedBytes: 120_000_000_000,
            limitBytes: 10_000_000_000,
        });
        expect(message).toContain('120 GB (120000000000 bytes)');
        expect(message).toContain('10 GB (10000000000 bytes) limit');
        expect(isWarehouseResourceLimitError(message)).toBe(true);
    });
});
