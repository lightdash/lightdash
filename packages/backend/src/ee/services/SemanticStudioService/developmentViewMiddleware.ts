import {
    DEVELOPMENT_PREVIEW_HEADER,
    DEVELOPMENT_VIEW_HEADER,
    getErrorMessage,
    type Account,
    type RegisteredAccount,
} from '@lightdash/common';
import { type RequestHandler } from 'express';
import { toSessionUser } from '../../../auth/account';
import Logger from '../../../logging/logger';
import {
    developmentView,
    type DevelopmentView,
} from '../../../services/ProjectService/developmentView';
import { type SemanticStudioCheckoutService } from './SemanticStudioCheckoutService';
import { type SemanticStudioService } from './SemanticStudioService';

const isRegistered = (account: Account): account is RegisteredAccount =>
    account.user.type === 'registered';

/** Has a request that asks for the development view read the person's own drafted models over the live ones. */
export const developmentViewMiddleware: RequestHandler = (req, _res, next) => {
    if (req.get(DEVELOPMENT_VIEW_HEADER) !== 'true') {
        next();
        return;
    }
    const previewProjectUuid = req.get(DEVELOPMENT_PREVIEW_HEADER);
    type Found = ReturnType<SemanticStudioService['findDevelopmentExplores']>;
    // One request reads explores more than once; the draft is worked out once per project.
    const found = new Map<string, Found>();
    const findExplores: DevelopmentView['findExplores'] = (
        account,
        projectUuid,
    ) => {
        if (!isRegistered(account)) return Promise.resolve(null);
        const known = found.get(projectUuid);
        if (known) return known;
        const { services } = req;
        const user = toSessionUser(account);
        // Reading the draft or the preview reads projects themselves, which must see what is live.
        const reading: Found = developmentView
            .exit(() =>
                previewProjectUuid
                    ? services
                          .getSemanticStudioCheckoutService<SemanticStudioCheckoutService>()
                          .findPreviewExplores(
                              user,
                              projectUuid,
                              previewProjectUuid,
                          )
                    : services
                          .getSemanticStudioService<SemanticStudioService>()
                          .findDevelopmentExplores(user, projectUuid),
            )
            // A draft that cannot be read, or a preview that is gone, must not take the live project down with it.
            .catch((error: unknown) => {
                Logger.warn(
                    `Development view fell back to live for project ${projectUuid}: ${getErrorMessage(error)}`,
                );
                return null;
            });
        found.set(projectUuid, reading);
        return reading;
    };
    developmentView.run(
        {
            findExplores,
            hasChanges: async (projectUuid) =>
                // Asked late, once the request knows who is making it.
                req.account !== undefined &&
                (await findExplores(req.account, projectUuid)) !== null,
        },
        next,
    );
};
