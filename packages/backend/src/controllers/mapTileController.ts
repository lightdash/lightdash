import {
    ApiErrorPayload,
    assertIsAccountWithOrg,
    AuthorizationError,
    ParameterError,
    UnexpectedServerError,
} from '@lightdash/common';
import { context } from '@opentelemetry/api';
import { suppressTracing } from '@opentelemetry/core';
import {
    Get,
    Middlewares,
    OperationId,
    Path,
    Request,
    Response,
    Route,
    SuccessResponse,
    Tags,
} from '@tsoa/runtime';
import express from 'express';
import fetch from 'node-fetch';
import { lightdashConfig } from '../config/lightdashConfig';
import { allowApiKeyAuthentication, isAuthenticated } from './authentication';
import { BaseController } from './baseController';

const STYLE_PATHS = {
    light: 'light_all',
    dark: 'dark_all',
    voyager: 'rastertiles/voyager',
} as const;

export type CartoTileStyle = keyof typeof STYLE_PATHS;

const MAX_TILE_BYTES = 1024 * 1024;

@Route('/api/v1/map-tiles')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('Map')
export class MapTileController extends BaseController {
    /**
     * Serve CARTO basemap images without exposing the provider credential.
     * Session and verified embed accounts are both supported.
     * @summary Get map tile
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/{style}/{z}/{x}/{y}.png')
    @OperationId('getMapTile')
    async getTile(
        @Request() req: express.Request,
        @Path() style: CartoTileStyle,
        @Path() z: number,
        @Path() x: number,
        @Path() y: number,
    ): Promise<void> {
        // Basemap imagery is public data, available to any authenticated org
        // member or verified embed account. No chart/warehouse data is read.
        if (!req.account) throw new AuthorizationError();
        assertIsAccountWithOrg(req.account);
        if (
            !Object.hasOwn(STYLE_PATHS, style) ||
            !Number.isInteger(z) ||
            z < 0 ||
            z > 20 ||
            !Number.isInteger(x) ||
            !Number.isInteger(y) ||
            x < 0 ||
            y < 0 ||
            x >= 2 ** z ||
            y >= 2 ** z
        ) {
            throw new ParameterError('Invalid map tile coordinates or style');
        }

        // Only fixed CARTO paths are allowed. Never accept a caller-provided URL
        // or forward cookies, auth headers, upstream errors or redirects.
        const url = new URL(
            `https://basemaps.cartocdn.com/${STYLE_PATHS[style]}/${z}/${x}/${y}.png`,
        );
        if (lightdashConfig.carto.apiKey)
            url.searchParams.set('key', lightdashConfig.carto.apiKey);
        try {
            const response = await context.with(
                suppressTracing(context.active()),
                () =>
                    fetch(url, {
                        redirect: 'error',
                        timeout: 10_000,
                        size: MAX_TILE_BYTES,
                    }),
            );
            const data = await response.buffer();
            if (
                !response.ok ||
                response.headers.get('content-type')?.split(';')[0] !==
                    'image/png' ||
                !data
                    .subarray(0, 8)
                    .equals(Buffer.from('89504e470d0a1a0a', 'hex'))
            ) {
                throw new Error('Invalid tile response');
            }
            const cacheControl = response.headers.get('cache-control') ?? '';
            const maxAge = /(?:^|,)\s*max-age=(\d+)/i.exec(cacheControl);
            const age = Number(response.headers.get('age') ?? 0);
            const ttl = /\b(?:no-store|no-cache|private)\b/i.test(cacheControl)
                ? 0
                : Math.max(0, Math.min(86400, Number(maxAge?.[1] ?? 0) - age));
            // Don't retain a watermarked anonymous response after an
            // operator configures a key. No server-side tile cache.
            const { res } = req as express.Request & { res: express.Response };
            res.setHeader('Content-Type', 'image/png');
            res.setHeader(
                'Cache-Control',
                lightdashConfig.carto.apiKey && Number.isFinite(ttl) && ttl > 0
                    ? `private, max-age=${ttl}`
                    : 'no-store',
            );
            res.send(data);
        } catch {
            // Fetch errors can include the upstream URL and its secret key.
            throw new UnexpectedServerError('Unable to load CARTO map tile');
        }
    }
}
