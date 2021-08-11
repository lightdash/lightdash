import express from 'express';
import passport from 'passport';
import { validateEmail } from 'common';
import {
    getAllTables,
    getStatus,
    getTable,
    refreshAllTables,
    runQuery,
} from '../lightdash';
import { buildQuery } from '../queryBuilder';
import { getHealthState } from '../health';
import { UserModel } from '../models/User';
import { ParameterError } from '../errors';
import { OrgModel } from '../models/Org';
import { analytics } from '../analytics/client';
import { SavedQueriesModel } from '../models/savedQueries';
import { isAuthenticated, unauthorisedInDemo } from './authentication';

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
    const sanitizeStringField = (value: any) => {
        if (!value || typeof value !== 'string') {
            throw new ParameterError();
        }
        const trimmedValue = value.trim();
        if (trimmedValue.length <= 0) {
            throw new ParameterError();
        }
        return trimmedValue;
    };

    const sanitizeEmailField = (value: any) => {
        const email = sanitizeStringField(value);
        if (!validateEmail(email)) {
            throw new ParameterError();
        }
        return email;
    };
    try {
        const lightdashUser = await UserModel.register({
            firstName: sanitizeStringField(req.body.firstName),
            lastName: sanitizeStringField(req.body.lastName),
            organizationName: sanitizeStringField(req.body.organizationName),
            email: sanitizeEmailField(req.body.email),
            password: sanitizeStringField(req.body.password),
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

apiV1Router.get('/user', isAuthenticated, async (req, res) => {
    res.json({
        status: 'ok',
        results: UserModel.lightdashUserFromSession(req.user!),
    });
});

apiV1Router.patch(
    '/user/me',
    isAuthenticated,
    unauthorisedInDemo,
    async (req, res, next) => {
        UserModel.updateProfile(req.user!.userId, req.user!.email, req.body)
            .then((user) => {
                res.json({
                    status: 'ok',
                    results: user,
                });
            })
            .catch(next);
    },
);

apiV1Router.post(
    '/user/password',
    isAuthenticated,
    unauthorisedInDemo,
    async (req, res, next) =>
        UserModel.updatePassword(req.user!.userId, req.user!.userUuid, req.body)
            .then(() => {
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
            })
            .catch(next),
);

apiV1Router.patch(
    '/org',
    isAuthenticated,
    unauthorisedInDemo,
    async (req, res, next) =>
        OrgModel.updateOrg(req.user!.organizationUuid, req.body)
            .then(() => {
                analytics.track({
                    userId: req.user!.userUuid,
                    event: 'organization_updated',
                });
                res.json({
                    status: 'ok',
                });
            })
            .catch(next),
);

apiV1Router.get('/tables', isAuthenticated, async (req, res, next) => {
    getAllTables()
        .then((tables) =>
            res.json({
                status: 'ok',
                results: tables.map((table) => ({
                    name: table.tables[table.baseTable].name,
                    description: table.tables[table.baseTable].description,
                    sql: table.tables[table.baseTable].sqlTable,
                })),
            }),
        )
        .catch(next);
});

apiV1Router.get('/tables/:tableId', isAuthenticated, async (req, res, next) => {
    getTable(req.params.tableId)
        .then((table) => {
            res.json({
                status: 'ok',
                results: table,
            });
        })
        .catch(next);
});

apiV1Router.post(
    '/tables/:tableId/compileQuery',
    isAuthenticated,
    async (req, res, next) => {
        const { body } = req;
        getTable(req.params.tableId)
            .then((table) =>
                buildQuery({
                    explore: table,
                    metricQuery: {
                        dimensions: body.dimensions,
                        metrics: body.metrics,
                        filters: body.filters,
                        sorts: body.sorts,
                        limit: body.limit,
                    },
                }),
            )
            .then((sql) => {
                res.json({
                    status: 'ok',
                    results: sql,
                });
            })
            .catch(next);
    },
);

apiV1Router.post(
    '/tables/:tableId/runQuery',
    isAuthenticated,
    async (req, res, next) => {
        const { body } = req;
        console.log('unQuery body', body);
        runQuery(req.params.tableId, {
            dimensions: body.dimensions,
            metrics: body.metrics,
            filters: body.filters,
            sorts: body.sorts,
            limit: body.limit,
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
    refreshAllTables().catch((e) => console.log(`Error running refresh: ${e}`));
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
