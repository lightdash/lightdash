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

describe('MotherDuck instance cache metrics', () => {
    beforeEach(() => {
        prometheus.register.clear();
    });

    afterEach(() => {
        prometheus.register.clear();
    });

    it('exposes enough project-scoped signals to evaluate a canary', async () => {
        const metrics = new PrometheusMetrics(lightdashConfigMock.prometheus);
        metrics.motherduckCacheAcquisitionCounter = new prometheus.Counter({
            name: 'test_motherduck_cache_acquisitions_total',
            help: 'test',
            labelNames: ['result', 'project_uuid'],
        });
        metrics.motherduckCacheInstanceCreatedCounter = new prometheus.Counter({
            name: 'test_motherduck_cache_instances_created_total',
            help: 'test',
            labelNames: ['project_uuid'],
        });
        metrics.motherduckCacheEvictionCounter = new prometheus.Counter({
            name: 'test_motherduck_cache_evictions_total',
            help: 'test',
            labelNames: ['reason', 'project_uuid'],
        });
        metrics.motherduckCacheSizeGauge = new prometheus.Gauge({
            name: 'test_motherduck_cache_entries',
            help: 'test',
        });
        metrics.motherduckCacheRetryCounter = new prometheus.Counter({
            name: 'test_motherduck_cache_retries_total',
            help: 'test',
            labelNames: ['outcome'],
        });
        metrics.motherduckCacheAcquireDurationHistogram =
            new prometheus.Histogram({
                name: 'test_motherduck_cache_acquire_duration_seconds',
                help: 'test',
                labelNames: ['result', 'project_uuid'],
            });

        metrics.observeMotherduckCacheEvent({
            type: 'acquire',
            result: 'miss',
            entryId: 'entry-a',
            projectUuid: 'project-a',
            waitMs: 10,
            instanceCreateMs: 20,
            connectMs: 30,
        });
        metrics.observeMotherduckCacheEvent({
            type: 'acquire',
            result: 'hit',
            entryId: 'entry-a',
            projectUuid: 'project-a',
            waitMs: 1,
            instanceCreateMs: 0,
            connectMs: 2,
        });
        metrics.observeMotherduckCacheEvent({
            type: 'evict',
            entryId: 'entry-a',
            projectUuid: 'project-a',
            reason: 'idle_ttl',
            ageMs: 1000,
        });
        metrics.observeMotherduckCacheEvent({
            type: 'retry',
            entryId: 'entry-a',
            outcome: 'recovered',
        });
        metrics.observeMotherduckCacheEvent({ type: 'size', entries: 2 });

        await expect(
            metrics.motherduckCacheAcquisitionCounter.get(),
        ).resolves.toMatchObject({
            values: expect.arrayContaining([
                expect.objectContaining({
                    labels: { result: 'miss', project_uuid: 'project-a' },
                    value: 1,
                }),
                expect.objectContaining({
                    labels: { result: 'hit', project_uuid: 'project-a' },
                    value: 1,
                }),
            ]),
        });
        await expect(
            metrics.motherduckCacheInstanceCreatedCounter.get(),
        ).resolves.toMatchObject({
            values: [
                expect.objectContaining({
                    labels: { project_uuid: 'project-a' },
                    value: 1,
                }),
            ],
        });
        await expect(
            metrics.motherduckCacheEvictionCounter.get(),
        ).resolves.toMatchObject({
            values: [
                expect.objectContaining({
                    labels: {
                        reason: 'idle_ttl',
                        project_uuid: 'project-a',
                    },
                    value: 1,
                }),
            ],
        });
        await expect(
            metrics.motherduckCacheRetryCounter.get(),
        ).resolves.toMatchObject({
            values: [
                expect.objectContaining({
                    labels: { outcome: 'recovered' },
                    value: 1,
                }),
            ],
        });
        await expect(
            metrics.motherduckCacheSizeGauge.get(),
        ).resolves.toMatchObject({
            values: [expect.objectContaining({ value: 2 })],
        });
        await expect(
            metrics.motherduckCacheAcquireDurationHistogram.get(),
        ).resolves.toMatchObject({
            values: expect.arrayContaining([
                expect.objectContaining({
                    metricName:
                        'test_motherduck_cache_acquire_duration_seconds_sum',
                    labels: { result: 'miss', project_uuid: 'project-a' },
                    value: 0.06,
                }),
                expect.objectContaining({
                    metricName:
                        'test_motherduck_cache_acquire_duration_seconds_sum',
                    labels: { result: 'hit', project_uuid: 'project-a' },
                    value: 0.003,
                }),
            ]),
        });
    });
});
