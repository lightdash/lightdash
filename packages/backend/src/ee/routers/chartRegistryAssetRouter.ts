import express from 'express';
import {
    allowApiKeyAuthentication,
    isAuthenticated,
} from '../../controllers/authentication';
import type { AppGenerateService } from '../services/AppGenerateService/AppGenerateService';

/**
 * Thin authenticated pass-through to chart registry images (thumbnails,
 * screenshots). `ChartRegistryClient.getAsset` already enforces the real
 * security invariants — path must be enumerated in the index, 2xx only, and
 * an image-only content-type allowlist — so this router only handles auth
 * and translating the result into an HTTP response.
 */
export const chartRegistryAssetRouter = express.Router();

chartRegistryAssetRouter.get(
    '/assets',
    allowApiKeyAuthentication,
    isAuthenticated,
    async (req, res, next) => {
        try {
            const path =
                typeof req.query.path === 'string' ? req.query.path : '';
            if (!path) {
                res.status(400).send('Missing required query param: path');
                return;
            }
            const service =
                req.services.getAppGenerateService<AppGenerateService>();
            const asset = await service.getRegistryAsset(path);
            if (!asset) {
                res.status(404).send('Not found');
                return;
            }
            res.setHeader('Content-Type', asset.contentType);
            res.setHeader('Cache-Control', 'private, max-age=3600');
            res.send(asset.buffer);
        } catch (e) {
            next(e);
        }
    },
);
