import {
    CreateSnowflakeCredentials,
    SnowflakeAuthenticationType,
    WarehouseTypes,
} from '@lightdash/common';
import { SnowflakeWarehouseClient } from '@lightdash/warehouses';
import { UserWarehouseCredentialsModel } from '../../models/UserWarehouseCredentials/UserWarehouseCredentialsModel';
import { mergePersonalWarehouseCredentials } from '../ProjectService/personalWarehouseCredentials';
import { UserService } from '../UserService';

export const getSnowflakeLogin = async ({
    projectUuid,
    userUuid,
    projectCredentials,
    userWarehouseCredentialsModel,
}: {
    projectUuid: string;
    userUuid: string;
    projectCredentials: CreateSnowflakeCredentials;
    userWarehouseCredentialsModel: UserWarehouseCredentialsModel;
}): Promise<string | null> => {
    const personal =
        await userWarehouseCredentialsModel.findForProjectWithSecrets(
            projectUuid,
            userUuid,
            WarehouseTypes.SNOWFLAKE,
        );
    if (!personal) return null;
    const merged = mergePersonalWarehouseCredentials(
        projectCredentials,
        personal,
    );
    if (merged.type !== WarehouseTypes.SNOWFLAKE) return null;
    let credentials = merged;
    if (credentials.authenticationType === SnowflakeAuthenticationType.SSO) {
        if (!credentials.refreshToken) return null;
        const { accessToken, refreshToken } =
            await UserService.generateSnowflakeAccessToken(
                credentials.refreshToken,
            );
        if (refreshToken !== credentials.refreshToken) {
            await userWarehouseCredentialsModel.rotateRefreshToken(
                personal.uuid,
                credentials.refreshToken,
                refreshToken,
            );
        }
        credentials = {
            ...credentials,
            token: accessToken,
            refreshToken,
        };
    }
    const client = new SnowflakeWarehouseClient(credentials);
    const result = await client.runQuery(
        'SELECT CURRENT_USER() AS CURRENT_USER',
    );
    const login = result.rows[0]?.CURRENT_USER;
    return typeof login === 'string' && login.length > 0 ? login : null;
};
