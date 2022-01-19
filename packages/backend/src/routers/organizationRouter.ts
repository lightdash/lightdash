import { OnboardingStatus } from 'common';
import express from 'express';
import {
    isAuthenticated,
    unauthorisedInDemo,
} from '../controllers/authentication';
import { ForbiddenError } from '../errors';
import {
    organizationService,
    projectService,
    savedChartsService,
    userService,
} from '../services/services';

export const organizationRouter = express.Router();

organizationRouter.patch(
    '/',
    isAuthenticated,
    unauthorisedInDemo,
    async (req, res, next) =>
        organizationService
            .updateOrg(req.user!, req.body)
            .then(() => {
                res.json({
                    status: 'ok',
                });
            })
            .catch(next),
);

organizationRouter.get('/projects', isAuthenticated, async (req, res, next) =>
    organizationService
        .getProjects(req.user!)
        .then((results) => {
            res.json({
                status: 'ok',
                results,
            });
        })
        .catch(next),
);

organizationRouter.post('/projects', isAuthenticated, async (req, res, next) =>
    projectService
        .create(req.user!, req.body)
        .then((results) => {
            res.json({
                status: 'ok',
                results,
            });
        })
        .catch(next),
);

organizationRouter.get('/users', isAuthenticated, async (req, res, next) =>
    organizationService
        .getUsers(req.user!)
        .then((results) => {
            res.json({
                status: 'ok',
                results,
            });
        })
        .catch(next),
);

organizationRouter.patch(
    '/users/:userUuid',
    isAuthenticated,
    async (req, res, next) => {
        organizationService
            .updateMember(req.user!, req.params.userUuid, req.body)
            .then((results) => {
                res.json({
                    status: 'ok',
                    results,
                });
            });
    },
);

organizationRouter.delete(
    '/user/:userUuid',
    isAuthenticated,
    unauthorisedInDemo,
    async (req, res, next) => {
        if (req.user!.userUuid === req.params.userUuid) {
            throw new ForbiddenError('User can not delete themself');
        }

        await userService
            .delete(req.user!, req.params.userUuid)
            .then(() => {
                res.json({
                    status: 'ok',
                    results: undefined,
                });
            })
            .catch(next);
    },
);

organizationRouter.get(
    '/onboardingStatus',
    isAuthenticated,
    async (req, res, next) => {
        try {
            let results: OnboardingStatus;
            const onboarding = await organizationService.getOnboarding(
                req.user!,
            );

            if (onboarding.shownSuccessAt) {
                results = {
                    isComplete: true,
                    showSuccess: false,
                };
            } else {
                const connectedProject = await projectService.hasProject();
                const definedMetric = await projectService.hasMetrics(
                    req.user!,
                );
                const savedChart = await savedChartsService.hasSavedCharts(
                    req.user!,
                );
                const invitedUser = await organizationService.hasInvitedUser(
                    req.user!,
                );

                const ranQuery = !!onboarding.ranQueryAt;

                const isComplete: boolean =
                    connectedProject &&
                    definedMetric &&
                    savedChart &&
                    invitedUser &&
                    ranQuery;

                if (isComplete) {
                    results = {
                        isComplete: true,
                        showSuccess: true,
                    };
                } else {
                    results = {
                        isComplete: false,
                        connectedProject,
                        definedMetric,
                        savedChart,
                        invitedUser,
                        ranQuery,
                    };
                }
            }

            res.json({
                status: 'ok',
                results,
            });
        } catch (e) {
            next(e);
        }
    },
);

organizationRouter.post(
    '/onboardingStatus/shownSuccess',
    isAuthenticated,
    async (req, res, next) => {
        try {
            await organizationService.setOnboardingSuccessDate(req.user!);
            res.json({
                status: 'ok',
                results: undefined,
            });
        } catch (e) {
            next(e);
        }
    },
);
