import {
    getObjectValue,
    getRequestMethod,
    LightdashRequestMethodHeader,
    NotFoundError,
    ProjectCatalog,
    TablesConfiguration,
} from '@lightdash/common';
import express, { type Router } from 'express';
import path from 'path';
import {
    allowApiKeyAuthentication,
    isAuthenticated,
    unauthorisedInDemo,
} from '../controllers/authentication';

const fs = require('fs');

export const projectRouter: Router = express.Router({ mergeParams: true });

projectRouter.patch<{ projectUuid: string }>(
    '/',
    allowApiKeyAuthentication,
    isAuthenticated,
    unauthorisedInDemo,
    async (req, res, next) => {
        req.services
            .getProjectService()
            .updateAndScheduleAsyncWork(
                getObjectValue(req.params, 'projectUuid'),
                req.account!,
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

projectRouter.put<{ projectUuid: string }>(
    '/warehouse-credentials',
    allowApiKeyAuthentication,
    isAuthenticated,
    unauthorisedInDemo,
    async (req, res, next) => {
        req.services
            .getProjectService()
            .updateWarehouseCredentials(
                getObjectValue(req.params, 'projectUuid'),
                req.account!,
                { warehouseConnection: req.body.warehouseConnection },
            )
            .then(() => {
                res.json({
                    status: 'ok',
                });
            })
            .catch(next);
    },
);

projectRouter.get<{ projectUuid: string; query: string }>(
    '/search/:query',
    allowApiKeyAuthentication,
    isAuthenticated,
    async (req, res, next) => {
        try {
            const { type, fromDate, toDate, createdByUuid, verifiedOnly } =
                req.query;
            const results = await req.services
                .getSearchService()
                .getSearchResults(
                    req.user!,
                    getObjectValue(req.params, 'projectUuid'),
                    getObjectValue(req.params, 'query'),
                    req.query.source as 'omnibar' | 'ai_search_box' | undefined,
                    {
                        type: type?.toString(),
                        fromDate: fromDate?.toString(),
                        toDate: toDate?.toString(),
                        createdByUuid: createdByUuid?.toString(),
                        verifiedOnly: verifiedOnly === 'true',
                    },
                );
            res.json({ status: 'ok', results });
        } catch (e) {
            next(e);
        }
    },
);

projectRouter.get<{ nanoId: string; projectUuid: string }>(
    '/csv/:nanoId',
    allowApiKeyAuthentication,
    isAuthenticated,
    async (req, res, next) => {
        try {
            const { nanoId } = req.params;
            const { path: filePath } = await req.services
                .getDownloadFileService()
                .getDownloadFileForProject(
                    req.account!,
                    getObjectValue(req.params, 'projectUuid'),
                    nanoId,
                );
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

projectRouter.post<{ fieldId: string; projectUuid: string }>(
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
                    req.body.parameters,
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

projectRouter.post<{ projectUuid: string }>(
    '/saved',
    allowApiKeyAuthentication,
    isAuthenticated,
    unauthorisedInDemo,
    async (req, res, next) => {
        try {
            const savedChartsService = req.services.getSavedChartService();
            const projectUuid = getObjectValue(req.params, 'projectUuid');

            if (req.query.duplicateFrom) {
                const results = await savedChartsService.duplicate(
                    req.user!,
                    projectUuid,
                    req.query.duplicateFrom.toString(),
                    req.body,
                );

                res.json({
                    status: 'ok',
                    results,
                });
                return;
            }

            const results = await savedChartsService.create(
                req.account!,
                projectUuid,
                req.body,
            );

            res.json({
                status: 'ok',
                results,
            });
        } catch (error) {
            next(error);
        }
    },
);

projectRouter.patch<{ projectUuid: string }>(
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

projectRouter.get<{ projectUuid: string }>(
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

projectRouter.get<{ projectUuid: string }>(
    '/verified-content-homepage',
    allowApiKeyAuthentication,
    isAuthenticated,
    async (req, res, next) => {
        req.services
            .getProjectService()
            .getVerifiedContentForHomepage(
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

projectRouter.patch<{ spaceUuid: string }>(
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

projectRouter.get<{ projectUuid: string }>(
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

projectRouter.get<{ projectUuid: string }>(
    '/tablesConfiguration',
    allowApiKeyAuthentication,
    isAuthenticated,
    async (req, res, next) => {
        try {
            const results: TablesConfiguration = await req.services
                .getProjectService()
                .getTablesConfiguration(
                    req.account!,
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

projectRouter.patch<{ projectUuid: string }>(
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

projectRouter.get<{ projectUuid: string }>(
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
