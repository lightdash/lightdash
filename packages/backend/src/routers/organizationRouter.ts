import {
    ForbiddenError,
    getRequestMethod,
    LightdashRequestMethodHeader,
    OnboardingStatus,
} from '@lightdash/common';
import express from 'express';
import {
    allowApiKeyAuthentication,
    isAuthenticated,
    unauthorisedInDemo,
} from '../controllers/authentication';

export const organizationRouter = express.Router();

organizationRouter.post(
    '/projects/precompiled',
    allowApiKeyAuthentication,
    isAuthenticated,
    unauthorisedInDemo,
    async (req, res, next) =>
        req.services
            .getProjectService()
            .scheduleCreate(
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
            .catch(next),
);

organizationRouter.delete(
    '/projects/:projectUuid',
    allowApiKeyAuthentication,
    isAuthenticated,
    unauthorisedInDemo,
    async (req, res, next) =>
        req.services
            .getProjectService()
            .delete(req.params.projectUuid, req.user!)
            .then((results) => {
                res.json({
                    status: 'ok',
                    results,
                });
            })
            .catch(next),
);

organizationRouter.get(
    '/onboardingStatus',
    isAuthenticated,
    async (req, res, next) => {
        try {
            const onboarding = await req.services
                .getOrganizationService()
                .getOnboarding(req.user!);
            const results: OnboardingStatus = {
                ranQuery: !!onboarding.ranQueryAt,
            };
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
            await req.services
                .getOrganizationService()
                .setOnboardingSuccessDate(req.user!);
            res.json({
                status: 'ok',
                results: undefined,
            });
        } catch (e) {
            next(e);
        }
    },
);
