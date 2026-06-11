import {
    assertEmbeddedAuth,
    ForbiddenError,
    getObjectValue,
    getRequestMethod,
    LightdashRequestMethodHeader,
    NotFoundError,
    ProjectCatalog,
    TablesConfiguration,
    type CreateSavedChart,
    type SessionUser,
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

const getSessionUser = (req: express.Request): SessionUser => {
    if (!req.user) {
        throw new ForbiddenError('User is required');
    }
    return req.user;
};

const getCreateSavedChartContext = async (
    req: express.Request,
    projectUuid: string,
): Promise<{ actor: SessionUser; savedChart: CreateSavedChart }> => {
    if (req.account?.authentication.type !== 'jwt') {
        return {
            actor: getSessionUser(req),
            savedChart: req.body as CreateSavedChart,
        };
    }

    assertEmbeddedAuth(req.account);

    if (projectUuid !== req.account.embed.projectUuid) {
        throw new ForbiddenError(
            'Embed token cannot create charts in this project',
        );
    }

    const { writeActions } = req.account.authentication.data;
    const actorUserUuid =
        writeActions?.userUuid ?? writeActions?.serviceAccountUserUuid;

    if (!writeActions?.spaceUuid || !actorUserUuid) {
        throw new ForbiddenError('Embed token does not allow write actions');
    }

    const savedChart = {
        ...(req.body as CreateSavedChart),
        dashboardUuid: undefined,
        spaceUuid: writeActions.spaceUuid,
    };

    const userService = req.services.getUserService();
    const actor = await userService.getSessionByUserUuidAndOrg(
        actorUserUuid,
        req.account.embed.organization.organizationUuid,
    );

    if (writeActions.userUuid !== undefined) {
        if (!actor.isActive) {
            throw new ForbiddenError(
                'Embed token actor is not active for this organization',
            );
        }

        return {
            actor,
            savedChart,
        };
    }

    const serviceAccount =
        await userService.findServiceAccountByUserUuid(actorUserUuid);
    if (
        serviceAccount === undefined ||
        serviceAccount.organizationUuid !==
            req.account.embed.organization.organizationUuid
    ) {
        throw new ForbiddenError(
            'Embed token service account is not valid for this organization',
        );
    }

    return {
        actor: {
            ...actor,
            serviceAccount: {
                uuid: serviceAccount.uuid,
                description: serviceAccount.description,
            },
        },
        savedChart,
    };
};

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

projectRouter.put(
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
                    req.query.source as 'omnibar' | 'ai_search_box' | undefined,
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

projectRouter.post(
    '/saved',
    allowApiKeyAuthentication,
    isAuthenticated,
    unauthorisedInDemo,
    async (req, res, next) => {
        try {
            const savedChartsService = req.services.getSavedChartService();
            const projectUuid = getObjectValue(req.params, 'projectUuid');

            if (req.query.duplicateFrom) {
                if (req.account?.authentication.type === 'jwt') {
                    throw new ForbiddenError(
                        'Embed token cannot duplicate charts',
                    );
                }

                const results = await savedChartsService.duplicate(
                    getSessionUser(req),
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

            const { actor, savedChart } = await getCreateSavedChartContext(
                req,
                projectUuid,
            );
            const results = await savedChartsService.create(
                actor,
                projectUuid,
                savedChart,
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

projectRouter.patch(
    '/saved',
    allowApiKeyAuthentication,
    isAuthenticated,
    unauthorisedInDemo,
    async (req, res, next) => {
        req.services
            .getSavedChartService()
            .updateMultiple(
                getSessionUser(req),
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

projectRouter.get(
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
