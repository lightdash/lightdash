import express from 'express';
import type { ReadinessService } from '../services/ReadinessService/ReadinessService';

export const createProbeRouter = (
    readinessService: Pick<ReadinessService, 'getReadiness'>,
) => {
    const router = express.Router();

    router.get('/livez', (_req, res) => {
        res.json({ status: 'ok' });
    });

    router.get('/readyz', async (_req, res) => {
        const result = await readinessService.getReadiness();
        res.status(result.status === 'ready' ? 200 : 503).json(result);
    });

    return router;
};
