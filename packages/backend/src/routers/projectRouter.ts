import {
    getObjectValue,
    getRequestMethod,
    LightdashRequestMethodHeader,
    NotFoundError,
    ProjectCatalog,
    TablesConfiguration,
} from '@lightdash/common';
import express from 'express';

import path from 'path';
import {
    allowApiKeyAuthentication,
    isAuthenticated,
    unauthorisedInDemo,
} from '../controllers/authentication';

const fs = require('fs');

export const projectRouter = express.Router({ mergeParams: true });

projectRouter.patch(
    '/',
    allowApiKeyAuthentication,
    isAuthenticated,
    unauthorisedInDemo,
    async (req, res, next) => {
        req.services
            .getProjectService()
            .updateAndScheduleAsyncWork(
                getObjectValue(req.params, 'projectUuid'),
                req.user!,
                req.body,
                getRequestMethod(req.header(LightdashRequestMethodHeader)),
            )
            .then((results) => {
                res.json({
                    status: 'ok',
                    results,
                });
            })
            .catch(next);
    },
);

projectRouter.get(
    '/search/:query',
    allowApiKeyAuthentication,
    isAuthenticated,
    async (req, res, next) => {
        try {
            const { type, fromDate, toDate, createdByUuid } = req.query;
            const results = await req.services
                .getSearchService()
                .getSearchResults(
                    req.user!,
                    getObjectValue(req.params, 'projectUuid'),
                    getObjectValue(req.params, 'query'),
                    {
                        type: type?.toString(),
                        fromDate: fromDate?.toString(),
                        toDate: toDate?.toString(),
                        createdByUuid: createdByUuid?.toString(),
                    },
                );
            res.json({ status: 'ok', results });
        } catch (e) {
            next(e);
        }
    },
);

projectRouter.get(
    '/csv/:nanoId',

    async (req, res, next) => {
        try {
            const { nanoId } = req.params;
            const { path: filePath } = await req.services
                .getDownloadFileService()
                .getDownloadFile(nanoId);
            const filename = path.basename(filePath);
            const normalizedPath = path.resolve('/tmp/', filename);
            if (!normalizedPath.startsWith('/tmp/')) {
                throw new NotFoundError(`File not found ${filename}`);
            }
            if (!fs.existsSync(normalizedPath)) {
                throw new NotFoundError(`File not found: ${filename}`);
            }
            res.set('Content-Type', 'text/csv');
            res.set(
                'Content-Disposition',
                `attachment; filename="${filename}"`,
            );
            res.sendFile(normalizedPath);
        } catch (error) {
            next(error);
        }
    },
);

projectRouter.post(
    '/field/:fieldId/search',
    allowApiKeyAuthentication,
    isAuthenticated,
    async (req, res, next) => {
        try {
            const results = await req.services
                .getProjectService()
                .searchFieldUniqueValues(
                    req.user!,
                    getObjectValue(req.params, 'projectUuid'),
                    req.body.table,
                    getObjectValue(req.params, 'fieldId'),
                    req.body.search,
                    req.body.limit,
                    req.body.filters,
                    req.body.forceRefresh,
                );

            res.json({
                status: 'ok',
                results,
            });
        } catch (e) {
            next(e);
        }
    },
);

projectRouter.post(
    '/saved',
    allowApiKeyAuthentication,
    isAuthenticated,
    unauthorisedInDemo,
    async (req, res, next) => {
        const savedChartsService = req.services.getSavedChartService();

        if (req.query.duplicateFrom) {
            savedChartsService
                .duplicate(
                    req.user!,
                    getObjectValue(req.params, 'projectUuid'),
                    req.query.duplicateFrom.toString(),
                    req.body,
                )
                .then((results) => {
                    res.json({
                        status: 'ok',
                        results,
                    });
                })
                .catch(next);
        } else {
            savedChartsService
                .create(
                    req.user!,
                    getObjectValue(req.params, 'projectUuid'),
                    req.body,
                )
                .then((results) => {
                    res.json({
                        status: 'ok',
                        results,
                    });
                })
                .catch(next);
        }
    },
);

projectRouter.patch(
    '/saved',
    allowApiKeyAuthentication,
    isAuthenticated,
    unauthorisedInDemo,
    async (req, res, next) => {
        req.services
            .getSavedChartService()
            .updateMultiple(
                req.user!,
                getObjectValue(req.params, 'projectUuid'),
                req.body,
            )
            .then((results) => {
                res.json({
                    status: 'ok',
                    results,
                });
            })
            .catch(next);
    },
);

projectRouter.get(
    '/most-popular-and-recently-updated',
    allowApiKeyAuthentication,
    isAuthenticated,
    async (req, res, next) => {
        req.services
            .getProjectService()
            .getMostPopularAndRecentlyUpdated(
                req.user!,
                getObjectValue(req.params, 'projectUuid'),
            )
            .then((results) => {
                res.json({
                    status: 'ok',
                    results,
                });
            })
            .catch(next);
    },
);

projectRouter.patch(
    '/spaces/:spaceUuid/pinning',
    allowApiKeyAuthentication,
    isAuthenticated,
    unauthorisedInDemo,
    async (req, res, next) => {
        req.services
            .getSpaceService()
            .togglePinning(req.user!, getObjectValue(req.params, 'spaceUuid'))
            .then((results) => {
                res.json({
                    status: 'ok',
                    results,
                });
            })
            .catch(next);
    },
);

projectRouter.get(
    '/catalog',
    allowApiKeyAuthentication,
    isAuthenticated,
    async (req, res, next) => {
        try {
            const results: ProjectCatalog = await req.services
                .getProjectService()
                .getCatalog(
                    req.user!,
                    getObjectValue(req.params, 'projectUuid'),
                );
            res.json({
                status: 'ok',
                results,
            });
        } catch (e) {
            next(e);
        }
    },
);

projectRouter.get(
    '/tablesConfiguration',
    allowApiKeyAuthentication,
    isAuthenticated,
    async (req, res, next) => {
        try {
            const results: TablesConfiguration = await req.services
                .getProjectService()
                .getTablesConfiguration(
                    req.user!,
                    getObjectValue(req.params, 'projectUuid'),
                );
            res.json({
                status: 'ok',
                results,
            });
        } catch (e) {
            next(e);
        }
    },
);

projectRouter.patch(
    '/tablesConfiguration',
    allowApiKeyAuthentication,
    isAuthenticated,
    unauthorisedInDemo,
    async (req, res, next) => {
        try {
            const results: TablesConfiguration = await req.services
                .getProjectService()
                .updateTablesConfiguration(
                    req.user!,
                    getObjectValue(req.params, 'projectUuid'),
                    req.body,
                );
            res.json({
                status: 'ok',
                results,
            });
        } catch (e) {
            next(e);
        }
    },
);

projectRouter.get(
    '/hasSavedCharts',
    allowApiKeyAuthentication,
    isAuthenticated,
    async (req, res, next) => {
        try {
            const results = await req.services
                .getProjectService()
                .hasSavedCharts(
                    req.user!,
                    getObjectValue(req.params, 'projectUuid'),
                );
            res.json({
                status: 'ok',
                results,
            });
        } catch (e) {
            next(e);
        }
    },
);
