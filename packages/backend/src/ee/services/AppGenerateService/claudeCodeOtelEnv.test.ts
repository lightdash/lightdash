import type { DataAppOtelConfig } from '../../../config/parseConfig';
import {
    buildClaudeCodeOtelEnv,
    claudeCodeOtelAllowedHosts,
} from './claudeCodeOtelEnv';

const exporterConfig = {
    endpoint: 'https://collector.example.com',
    protocol: 'http/protobuf',
    exportIntervalMs: 1000,
};

describe('buildClaudeCodeOtelEnv', () => {
    test('emits the traces-only telemetry env with endpoint, protocol and interval', () => {
        const env = buildClaudeCodeOtelEnv(exporterConfig, {}, undefined);

        expect(env).toEqual({
            CLAUDE_CODE_ENABLE_TELEMETRY: '1',
            CLAUDE_CODE_ENHANCED_TELEMETRY_BETA: '1',
            OTEL_TRACES_EXPORTER: 'otlp',
            OTEL_METRICS_EXPORTER: 'none',
            OTEL_LOGS_EXPORTER: 'none',
            OTEL_EXPORTER_OTLP_PROTOCOL: 'http/protobuf',
            OTEL_EXPORTER_OTLP_ENDPOINT: 'https://collector.example.com',
            OTEL_TRACES_EXPORT_INTERVAL: '1000',
        });
    });

    test('encodes resolved headers into OTEL_EXPORTER_OTLP_HEADERS', () => {
        const env = buildClaudeCodeOtelEnv(
            exporterConfig,
            {
                Authorization: 'Bearer fake-access-token',
                'X-Goog-User-Project': 'proj-123',
            },
            undefined,
        );

        expect(env.OTEL_EXPORTER_OTLP_HEADERS).toBe(
            'Authorization=Bearer fake-access-token,X-Goog-User-Project=proj-123',
        );
    });

    test('omits the headers env entirely when no headers are resolved', () => {
        const env = buildClaudeCodeOtelEnv(exporterConfig, {}, undefined);
        expect(env).not.toHaveProperty('OTEL_EXPORTER_OTLP_HEADERS');
    });

    test('injects TRACEPARENT for nesting when provided, and omits it otherwise', () => {
        const traceparent =
            '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01';
        expect(
            buildClaudeCodeOtelEnv(exporterConfig, {}, traceparent).TRACEPARENT,
        ).toBe(traceparent);
        expect(
            buildClaudeCodeOtelEnv(exporterConfig, {}, undefined),
        ).not.toHaveProperty('TRACEPARENT');
    });
});

describe('claudeCodeOtelAllowedHosts', () => {
    const base: DataAppOtelConfig = {
        enabled: true,
        endpoint: 'https://collector.example.com:4318',
        protocol: 'http/protobuf',
        exportIntervalMs: 1000,
        auth: { type: 'none' },
    };

    test('returns the collector host when enabled', () => {
        expect(claudeCodeOtelAllowedHosts(base)).toEqual([
            'collector.example.com',
        ]);
    });

    test('returns nothing when disabled', () => {
        expect(claudeCodeOtelAllowedHosts({ ...base, enabled: false })).toEqual(
            [],
        );
    });

    test('returns nothing when the endpoint is unset', () => {
        expect(claudeCodeOtelAllowedHosts({ ...base, endpoint: '' })).toEqual(
            [],
        );
    });

    test('returns nothing when the endpoint is unparseable', () => {
        expect(
            claudeCodeOtelAllowedHosts({ ...base, endpoint: 'not a url' }),
        ).toEqual([]);
    });
});
