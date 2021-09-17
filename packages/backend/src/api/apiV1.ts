import express from 'express';
import passport from 'passport';
import {
    ApiExploreResults,
    ApiExploresResults,
    isExploreError,
    MetricQuery,
} from 'common';
import { sanitizeStringParam, sanitizeEmailParam } from '../utils';
import {
    getAllExplores,
    getStatus,
    getExplore,
    refreshAllTables,
    runQuery,
} from '../lightdash';
import { buildQuery } from '../queryBuilder';
import { getHealthState } from '../health';
import { UserModel } from '../models/User';
import { analytics } from '../analytics/client';
import { SavedQueriesModel } from '../models/savedQueries';
import { isAuthenticated, unauthorisedInDemo } from './authentication';
import { inviteLinksRouter } from './inviteLinksRouter';
import { organizationRouter } from './organizationRouter';
import { userRouter } from './userRouter';
import { projectRouter } from './projectRouter';
import { compileMetricQuery } from '../queryCompiler';
import { CompileError } from '../errors';

export const apiV1Router = express.Router();

apiV1Router.get('/health', async (req, res, next) => {
    getHealthState(!!req.user?.userUuid)
        .then((state) =>
            res.json({
                status: 'ok',
                results: state,
            }),
        )
        .catch(next);
});

apiV1Router.post('/register', unauthorisedInDemo, async (req, res, next) => {
    try {
        const lightdashUser = await UserModel.register({
            firstName: sanitizeStringParam(req.body.firstName),
            lastName: sanitizeStringParam(req.body.lastName),
            organizationName: sanitizeStringParam(req.body.organizationName),
            email: sanitizeEmailParam(req.body.email),
            password: sanitizeStringParam(req.body.password),
            isMarketingOptedIn: !!req.body.isMarketingOptedIn,
            isTrackingAnonymized: !!req.body.isTrackingAnonymized,
        });
        const sessionUser = await UserModel.findSessionUserByUUID(
            lightdashUser.userUuid,
        );
        req.login(sessionUser, (err) => {
            if (err) {
                next(err);
            }
            res.json({
                status: 'ok',
                results: lightdashUser,
            });
        });
    } catch (e) {
        next(e);
    }
});

apiV1Router.post('/login', passport.authenticate('local'), (req, res, next) => {
    req.session.save((err) => {
        if (err) {
            next(err);
        } else {
            res.json({
                status: 'ok',
                results: UserModel.lightdashUserFromSession(req.user!),
            });
        }
    });
});

apiV1Router.get('/logout', (req, res, next) => {
    req.logout();
    req.session.save((err) => {
        if (err) {
            next(err);
        } else {
            res.json({
                status: 'ok',
            });
        }
    });
});

apiV1Router.get('/explores', isAuthenticated, async (req, res, next) => {
    getAllExplores(req.user!)
        .then((explores) => {
            const results: ApiExploresResults = explores.map((explore) =>
                isExploreError(explore)
                    ? { name: explore.name, errors: explore.errors }
                    : { name: explore.name },
            );
            res.json({
                status: 'ok',
                results,
            });
        })
        .catch(next);
});

apiV1Router.get(
    '/explores/:exploreId',
    isAuthenticated,
    async (req, res, next) => {
        getExplore(req.user!, req.params.exploreId)
            .then((explore) => {
                const results: ApiExploreResults = explore;
                res.json({
                    status: 'ok',
                    results,
                });
            })
            .catch(next);
    },
);

apiV1Router.post(
    '/explores/:exploreId/compileQuery',
    isAuthenticated,
    async (req, res, next) => {
        const { body } = req;
        try {
            const metricQuery: MetricQuery = {
                dimensions: body.dimensions,
                metrics: body.metrics,
                filters: body.filters,
                sorts: body.sorts,
                limit: body.limit,
                tableCalculations: body.tableCalculations,
            };
            const compiledMetricQuery = await compileMetricQuery(metricQuery);
            const explore = await getExplore(req.user!, req.params.exploreId);
            if (isExploreError(explore)) {
                throw new CompileError(
                    `Cannot compile query for explore ${
                        explore.name
                    }: ${explore.errors.join('\n')}`,
                    {},
                );
            }
            const sql = buildQuery({ explore, compiledMetricQuery });
            res.json({
                status: 'ok',
                results: sql,
            });
        } catch (e) {
            next(e);
        }
    },
);

apiV1Router.post(
    '/explores/:exploreId/runQuery',
    isAuthenticated,
    async (req, res, next) => {
        const { body } = req;
        await analytics.track({
            userId: req.user!.userUuid,
            event: 'query.executed',
        });
        runQuery(req.user!, req.params.exploreId, {
            dimensions: body.dimensions,
            metrics: body.metrics,
            filters: body.filters,
            sorts: body.sorts,
            limit: body.limit,
            tableCalculations: body.tableCalculations,
        })
            .then((results) => {
                res.json({
                    status: 'ok',
                    results,
                });
            })
            .catch(next);
    },
);

apiV1Router.post('/refresh', isAuthenticated, async (req, res) => {
    refreshAllTables(req.user!.userUuid).catch((e) =>
        console.log(`Error running refresh: ${e}`),
    );
    res.json({
        status: 'ok',
    });
});

apiV1Router.get('/status', isAuthenticated, async (req, res, next) => {
    getStatus()
        .then((status) => {
            res.json({
                status: 'ok',
                results: status,
            });
        })
        .catch(next);
});

apiV1Router.get('/spaces', isAuthenticated, async (req, res, next) => {
    SavedQueriesModel.getAllSpaces()
        .then((results) => {
            res.json({
                status: 'ok',
                results,
            });
        })
        .catch(next);
});

apiV1Router.get(
    '/saved/:savedQueryUuid',
    isAuthenticated,
    async (req, res, next) => {
        SavedQueriesModel.getById(req.params.savedQueryUuid)
            .then((results) => {
                res.json({
                    status: 'ok',
                    results,
                });
            })
            .catch(next);
    },
);

apiV1Router.post(
    '/saved',
    isAuthenticated,
    unauthorisedInDemo,
    async (req, res, next) => {
        SavedQueriesModel.create(req.user!.userUuid, req.body.savedQuery)
            .then((results) => {
                res.json({
                    status: 'ok',
                    results,
                });
            })
            .catch(next);
    },
);

apiV1Router.delete(
    '/saved/:savedQueryUuid',
    isAuthenticated,
    unauthorisedInDemo,
    async (req, res, next) => {
        SavedQueriesModel.delete(req.user!.userUuid, req.params.savedQueryUuid)
            .then(() => {
                res.json({
                    status: 'ok',
                    results: undefined,
                });
            })
            .catch(next);
    },
);

apiV1Router.patch(
    '/saved/:savedQueryUuid',
    isAuthenticated,
    unauthorisedInDemo,
    async (req, res, next) => {
        SavedQueriesModel.update(
            req.user!.userUuid,
            req.params.savedQueryUuid,
            req.body.savedQuery,
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

apiV1Router.post(
    '/saved/:savedQueryUuid/version',
    isAuthenticated,
    unauthorisedInDemo,
    async (req, res, next) => {
        SavedQueriesModel.addVersion(
            req.user!.userUuid,
            req.params.savedQueryUuid,
            req.body.savedQuery,
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

apiV1Router.use('/invite-links', inviteLinksRouter);
apiV1Router.use('/org', organizationRouter);
apiV1Router.use('/user', userRouter);
apiV1Router.use('/project', projectRouter);
