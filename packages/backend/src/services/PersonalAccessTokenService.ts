import {
    CreatePersonalAccessToken,
    PersonalAccessToken,
    SessionUser,
} from '@lightdash/common';
import { analytics } from '../analytics/client';
import { PersonalAccessTokenModel } from '../models/DashboardModel/PersonalAccessTokenModel';

type Dependencies = {
    personalAccessTokenModel: PersonalAccessTokenModel;
};

export class PersonalAccessTokenService {
    private readonly personalAccessTokenModel: PersonalAccessTokenModel;

    constructor(dependencies: Dependencies) {
        this.personalAccessTokenModel = dependencies.personalAccessTokenModel;
    }

    async createPersonalAccessToken(
        user: Pick<SessionUser, 'userId' | 'userUuid'>,
        data: CreatePersonalAccessToken,
    ): Promise<PersonalAccessToken & { token: string }> {
        const result = await this.personalAccessTokenModel.create(user, data);
        analytics.track({
            userId: user.userUuid,
            event: 'personal_access_token.created',
        });
        return result;
    }

    async deletePersonalAccessToken(
        user: Pick<SessionUser, 'userUuid'>,
        personalAccessTokenUuid: string,
    ): Promise<void> {
        await this.personalAccessTokenModel.delete(personalAccessTokenUuid);
        analytics.track({
            userId: user.userUuid,
            event: 'personal_access_token.deleted',
        });
    }

    async getAllPersonalAccessTokens(
        user: Pick<SessionUser, 'userId'>,
    ): Promise<PersonalAccessToken[]> {
        return this.personalAccessTokenModel.getAllForUser(user.userId);
    }
}
