import express from 'express';
import { isAuthenticated } from '../controllers/authentication';
import { shareService } from '../services/services';

export const shareRouter = express.Router({ mergeParams: true });

shareRouter.get('/', isAuthenticated, async (req, res, next) => {
    next('Not implemented');
});

shareRouter.get('/:nanoid', isAuthenticated, async (req, res, next) => {
    try {
        const shareUrl = await shareService.getShareUrl(req.params.nanoid);
        res.json({
            status: 'ok',
            results: shareUrl,
        });
    } catch (e) {
        next(e);
    }
});

shareRouter.post('/', isAuthenticated, async (req, res, next) => {
    try {
        const shareUrl = await shareService.createShareUrl(
            req.body.path,
            req.body.params,
        );
        res.json({
            status: 'ok',
            results: shareUrl,
        });
    } catch (e) {
        next(e);
    }
});
