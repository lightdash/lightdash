import OAuth2Server from '@node-oauth/oauth2-server';
import { OAuthResourceBinding } from './oauthResources';

export type OAuthTokenBinding = OAuthResourceBinding & {
    familyUuid: string | null;
    parentRefreshToken: string | null;
};

export const withOAuthTokenBinding = (
    model: OAuth2Server.AuthorizationCodeModel,
    binding: OAuthTokenBinding,
): OAuth2Server.AuthorizationCodeModel => {
    const boundModel: OAuth2Server.AuthorizationCodeModel = Object.create(
        model,
    ) as OAuth2Server.AuthorizationCodeModel;
    boundModel.saveToken = (token, client, user) =>
        model.saveToken({ ...token, ...binding }, client, user);
    return boundModel;
};
