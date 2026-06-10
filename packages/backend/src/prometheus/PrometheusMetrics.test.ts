import express from 'express';
import prometheus from 'prom-client';
import { AI_WRITEBACK_STAGES } from '../analytics/LightdashAnalytics';
import { LightdashConfig } from '../config/parseConfig';
import PrometheusMetrics, { getHttpUriLabel } from './PrometheusMetrics';

type PartialRequest = Partial<express.Request>;

const buildRequest = (overrides: PartialRequest): express.Request =>
    overrides as express.Request;

describe('getHttpUriLabel', () => {
    describe('matched routes', () => {
        it('returns the templated route path for a TSOA route with a path param', () => {
            const req = buildRequest({
                baseUrl: '/api/v1/projects',
                path: '/3675b69e-8324-4110-bdca-059031aa8da3/spaces',
                route: {
                    path: '/:projectUuid/spaces',
                } as express.Request['route'],
            });
            expect(getHttpUriLabel(req)).toBe(
                '/api/v1/projects/:projectUuid/spaces',
            );
        });

        it('collapses different param values into the same label', () => {
            const route = {
                path: '/:projectUuid',
            } as express.Request['route'];
            const a = getHttpUriLabel(
                buildRequest({
                    baseUrl: '/api/v1/projects',
                    path: '/aaaa',
                    route,
                }),
            );
            const b = getHttpUriLabel(
                buildRequest({
                    baseUrl: '/api/v1/projects',
                    path: '/bbbb',
                    route,
                }),
            );
            expect(a).toBe(b);
            expect(a).toBe('/api/v1/projects/:projectUuid');
        });

        it('handles a root-mounted route ("/" path)', () => {
            const req = buildRequest({
                baseUrl: '/api/v1/health',
                path: '/',
                route: { path: '/' } as express.Request['route'],
            });
            expect(getHttpUriLabel(req)).toBe('/api/v1/health');
        });

        it('handles missing baseUrl', () => {
            const req = buildRequest({
                baseUrl: '',
                path: '/livez',
                route: { path: '/livez' } as express.Request['route'],
            });
            expect(getHttpUriLabel(req)).toBe('/livez');
        });
    });

    describe('unmatched routes', () => {
        it('buckets unmatched paths into "unmatched" to cap cardinality', () => {
            const req = buildRequest({
                path: '/api/v1/does-not-exist',
            });
            expect(getHttpUriLabel(req)).toBe('unmatched');
        });

        it('buckets attacker scan paths into "unmatched"', () => {
            const paths = [
                '/wp-admin',
                '/.env',
                '/api/v1/projects/',
                '/api/v1/projects//spaces',
            ];
            for (const path of paths) {
                expect(getHttpUriLabel(buildRequest({ path }))).toBe(
                    'unmatched',
                );
            }
        });

        it('buckets static asset requests into "/assets/*"', () => {
            const req = buildRequest({
                path: '/assets/main-abc123.js',
            });
            expect(getHttpUriLabel(req)).toBe('/assets/*');
        });
    });
});

describe('labelled histogram zero-initialization', () => {
    let metrics: PrometheusMetrics;

    beforeAll(() => {
        metrics = new PrometheusMetrics({
            enabled: true,
            port: 0,
            path: '/metrics',
            eventMetricsEnabled: false,
            allQueryMetricsEnabled: false,
            extendedMetricsEnabled: false,
        } as LightdashConfig['prometheus']);
        metrics.start();
    });

    afterAll(() => {
        metrics.stop();
        prometheus.register.clear();
    });

    const getCountLabels = async (name: string, labelName: string) => {
        const metric = prometheus.register.getSingleMetric(name) as
            | prometheus.Histogram<string>
            | undefined;
        expect(metric).toBeDefined();
        const { values } = await metric!.get();
        return values
            .filter((value) => value.metricName === `${name}_count`)
            .map((value) => ({
                label: value.labels[labelName],
                value: value.value,
            }));
    };

    it('exports zero-valued series for every writeback stage at startup', async () => {
        const counts = await getCountLabels(
            'ai_writeback_stage_duration_ms',
            'stage',
        );
        expect(counts).toEqual(
            expect.arrayContaining(
                AI_WRITEBACK_STAGES.map((stage) => ({
                    label: stage,
                    value: 0,
                })),
            ),
        );
        expect(counts).toHaveLength(AI_WRITEBACK_STAGES.length);
    });

    it('exports zero-valued series for compile and run statuses at startup', async () => {
        const compileCounts = await getCountLabels(
            'ai_writeback_compile_duration_ms',
            'status',
        );
        const runCounts = await getCountLabels(
            'ai_writeback_run_duration_ms',
            'status',
        );
        const expected = [
            { label: 'success', value: 0 },
            { label: 'error', value: 0 },
        ];
        expect(compileCounts).toEqual(expect.arrayContaining(expected));
        expect(runCounts).toEqual(expect.arrayContaining(expected));
    });

    it('exports zero-valued series for github file read outcomes at startup', async () => {
        const counts = await getCountLabels(
            'ai_repofs_github_file_duration_ms',
            'outcome',
        );
        expect(counts).toEqual(
            expect.arrayContaining(
                ['found', 'missing', 'error'].map((outcome) => ({
                    label: outcome,
                    value: 0,
                })),
            ),
        );
    });
});
