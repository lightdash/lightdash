import express from 'express';
import prometheus from 'prom-client';
import { lightdashConfigMock } from '../config/lightdashConfig.mock';
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

describe('Project-attributed warehouse phase metrics', () => {
    beforeEach(() => {
        prometheus.register.clear();
    });

    afterEach(() => {
        prometheus.register.clear();
    });

    it('observes phase durations with the bounded project dimension', async () => {
        const metrics = new PrometheusMetrics(lightdashConfigMock.prometheus);
        const histogram = new prometheus.Histogram({
            name: 'test_query_warehouse_phase_duration_by_project_seconds',
            help: 'test',
            labelNames: ['project_uuid', 'phase', 'warehouse_type', 'context'],
        });
        Object.assign(metrics, {
            projectQueryPhaseDurationHistogram: histogram,
        });

        metrics.observeProjectQueryPhaseDurations(
            'project-a',
            { connect: 100, query: 200 },
            'postgres',
            'explore',
        );

        await expect(histogram.get()).resolves.toMatchObject({
            values: expect.arrayContaining([
                expect.objectContaining({
                    metricName:
                        'test_query_warehouse_phase_duration_by_project_seconds_sum',
                    labels: {
                        project_uuid: 'project-a',
                        phase: 'connect',
                        warehouse_type: 'postgres',
                        context: 'interactive',
                    },
                    value: 0.1,
                }),
                expect.objectContaining({
                    metricName:
                        'test_query_warehouse_phase_duration_by_project_seconds_sum',
                    labels: {
                        project_uuid: 'project-a',
                        phase: 'query',
                        warehouse_type: 'postgres',
                        context: 'interactive',
                    },
                    value: 0.2,
                }),
            ]),
        });
    });
});
