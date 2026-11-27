import { OpenIdIdentityIssuerType, SEED_ORG_1_ADMIN } from '@lightdash/common';
import { Knex } from 'knex';
import { lightdashConfig } from '../../../config/lightdashConfig';
import { UserOAuthGrantsModel } from '../../../models/UserOAuthGrantsModel';
import { EncryptionUtil } from '../../../utils/EncryptionUtil/EncryptionUtil';
import { UserOAuthGrantsTableName } from '../../entities/userOAuthGrants';
import { UserTableName } from '../../entities/users';

const seedSubject = 'rainbow-sheets-test';
const scopes = [
    'https://www.googleapis.com/auth/drive.file',
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
    'openid',
];

export async function seed(knex: Knex): Promise<void> {
    const refreshToken = process.env.GOOGLE_SHEETS_DEV_REFRESH_TOKEN;
    if (!refreshToken) return;

    const userUuid = SEED_ORG_1_ADMIN.user_uuid;
    const provider = OpenIdIdentityIssuerType.GOOGLE;
    const admin = await knex(UserTableName)
        .where('user_uuid', userUuid)
        .first('user_uuid');
    if (!admin) return;

    const existing = await knex(UserOAuthGrantsTableName)
        .where({ user_uuid: userUuid, provider })
        .first('provider_subject');
    if (existing && existing.provider_subject !== seedSubject) return;

    const grants = new UserOAuthGrantsModel({
        database: knex,
        encryptionUtil: new EncryptionUtil({ lightdashConfig }),
        userModel: {
            getRefreshToken: async () => {
                throw new Error('No development Google Sheets grant');
            },
        },
    });
    await grants.upsertGrant({
        userUuid,
        provider,
        subject: seedSubject,
        email: `${seedSubject}@example.invalid`,
        scopes,
        refreshToken,
    });
}
