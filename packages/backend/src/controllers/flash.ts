import { RequestHandler } from 'express';

export const getFlash: RequestHandler = (req, res) => {
    res.json({
        status: 'ok',
        results: req.flash(),
    });
};
