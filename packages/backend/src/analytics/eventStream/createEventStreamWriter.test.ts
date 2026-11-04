import { FeatureFlags } from '@lightdash/common';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import type PrometheusMetrics from '../../prometheus/PrometheusMetrics';
import { BufferedEventStreamWriter } from './BufferedEventStreamWriter';
import { createEventStreamWriter } from './createEventStreamWriter';

vi.mock('./BufferedEventStreamWriter');

const metrics = {} as PrometheusMetrics;
const storage = {
    endpoint: 'http://localhost:9000',
    bucket: 'usage-events',
    region: 'us-east-1',
    accessKey: 'test',
    secretKey: 'test',
};
const config = {
    ...lightdashConfigMock,
    enabledFeatureFlags: new Set<string>(),
    disabledFeatureFlags: new Set([FeatureFlags.AnalyticsProject]),
    usageEvents: {
        ...lightdashConfigMock.usageEvents,
        enabled: true,
        s3: storage,
    },
};

describe('createEventStreamWriter', () => {
    beforeEach(() => vi.clearAllMocks());

    it('creates a writer even when the analytics project flag is disabled', () => {
        expect(createEventStreamWriter(config, metrics)).toBeInstanceOf(
            BufferedEventStreamWriter,
        );
        expect(BufferedEventStreamWriter).toHaveBeenCalledWith({
            s3Config: storage,
            flushIntervalMs: config.usageEvents.flushIntervalMs,
            flushBatchSize: config.usageEvents.flushBatchSize,
            bufferMaxSize: config.usageEvents.bufferMaxSize,
            prometheusMetrics: metrics,
        });
    });

    it('does not create a writer when usage infrastructure is disabled', () => {
        expect(
            createEventStreamWriter(
                {
                    ...config,
                    usageEvents: { ...config.usageEvents, enabled: false },
                },
                metrics,
            ),
        ).toBeNull();
        expect(BufferedEventStreamWriter).not.toHaveBeenCalled();
    });

    it('does not create a writer without usage storage', () => {
        expect(
            createEventStreamWriter(
                { ...config, usageEvents: { ...config.usageEvents, s3: null } },
                metrics,
            ),
        ).toBeNull();
        expect(BufferedEventStreamWriter).not.toHaveBeenCalled();
    });
});
