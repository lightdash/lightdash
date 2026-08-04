import express from 'express';
import { getHttpUriLabel } from './PrometheusMetrics';

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
