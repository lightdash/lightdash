import { type Account, type RegisteredAccount } from '@lightdash/common';
import { type RequestHandler } from 'express';
import { toSessionUser } from '../../../auth/account';
import {
    DEVELOPMENT_PREVIEW_HEADER,
    DEVELOPMENT_VIEW_HEADER,
    developmentView,
} from '../../../services/ProjectService/developmentView';
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
    developmentView.run(
        {
            findExplores: async (account, projectUuid) => {
                if (!isRegistered(account)) return null;
                const service =
                    req.services.getSemanticStudioService<SemanticStudioService>();
                const user = toSessionUser(account);
                // Reading the draft or the preview reads projects themselves, which must see what is live.
                return developmentView.exit(() =>
                    previewProjectUuid
                        ? service.findPreviewExplores(
                              user,
                              projectUuid,
                              previewProjectUuid,
                          )
                        : service.findDevelopmentExplores(user, projectUuid),
                );
            },
        },
        next,
    );
};
