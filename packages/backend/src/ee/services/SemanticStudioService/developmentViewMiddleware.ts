import { type Account, type RegisteredAccount } from '@lightdash/common';
import { type RequestHandler } from 'express';
import { toSessionUser } from '../../../auth/account';
import {
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
    developmentView.run(
        {
            findExplores: async (account, projectUuid) =>
                isRegistered(account)
                    ? // Compiling the draft reads the project itself, which must see what is live.
                      developmentView.exit(() =>
                          req.services
                              .getSemanticStudioService<SemanticStudioService>()
                              .findDevelopmentExplores(
                                  toSessionUser(account),
                                  projectUuid,
                              ),
                      )
                    : null,
        },
        next,
    );
};
