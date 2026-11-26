import { OpenIdIdentityIssuerType, SEED_ORG_1_ADMIN } from '@lightdash/common';
import knex, { type Knex } from 'knex';
import { createRequire } from 'node:module';
import { UserOAuthGrantsTableName } from '../../database/entities/userOAuthGrants';
import { UserOAuthGrantsModel } from '../../models/UserOAuthGrantsModel';
import { EncryptionUtil } from '../../utils/EncryptionUtil/EncryptionUtil';

const seededAdminGoogle = {
    userUuid: SEED_ORG_1_ADMIN.user_uuid,
    provider: OpenIdIdentityIssuerType.GOOGLE as const,
};
const seedSubject = 'rainbow-sheets-test';
const googleSheetsScopes = [
    'https://www.googleapis.com/auth/drive.file',
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
    'openid',
];

const findGoogleGrant = (database: Knex) =>
    database(UserOAuthGrantsTableName)
        .where({
            user_uuid: seededAdminGoogle.userUuid,
            provider: seededAdminGoogle.provider,
        })
        .first('provider_subject', 'scopes', 'encrypted_refresh_token');

type GrantStore = {
    find: () => ReturnType<typeof findGoogleGrant>;
    upsert: UserOAuthGrantsModel['upsertGrant'];
    decrypt: EncryptionUtil['decrypt'];
};

function hasSeededToken(
    store: GrantStore,
    encryptedToken: Buffer,
    refreshToken: string,
): boolean {
    try {
        return store.decrypt(encryptedToken) === refreshToken;
    } catch {
        return false;
    }
}

export async function seedGoogleGrant(
    refreshToken: string | undefined,
    store: GrantStore,
): Promise<void> {
    if (!refreshToken) return;

    const existing = await store.find();
    if (existing) {
        if (existing.provider_subject !== seedSubject) return;
        if (
            hasSeededToken(
                store,
                existing.encrypted_refresh_token,
                refreshToken,
            )
        ) {
            return;
        }
    }

    await store.upsert({
        ...seededAdminGoogle,
        subject: seedSubject,
        email: `${seedSubject}@example.invalid`,
        scopes: googleSheetsScopes,
        refreshToken,
    });
}

export async function readConnectedGoogleGrant(
    store: GrantStore,
): Promise<string> {
    const grant = await store.find();
    if (
        !grant ||
        grant.provider_subject === seedSubject ||
        grant.scopes.length !== googleSheetsScopes.length ||
        !googleSheetsScopes.every((scope) => grant.scopes.includes(scope))
    ) {
        throw new Error('No manually connected Google Sheets grant');
    }
    return store.decrypt(grant.encrypted_refresh_token);
}

async function main(): Promise<string | undefined> {
    const action = process.argv[2];
    const refreshToken = process.env.GOOGLE_SHEETS_TEST_REFRESH_TOKEN;
    if (action === 'seed' && !refreshToken) return undefined;
    if (
        process.env.LIGHTDASH_MODE !== 'pr' ||
        (action !== 'seed' && action !== 'export') ||
        (action === 'export' && process.stdout.isTTY)
    ) {
        throw new Error('This command runs only in a preview');
    }

    const { lightdashConfig } = await import('../../config/lightdashConfig');
    const { default: knexConfig } = createRequire(__filename)(
        '../../knexfile',
    ) as typeof import('../../knexfile');
    const database = knex(knexConfig.development);
    const encryptionUtil = new EncryptionUtil({ lightdashConfig });
    const model = new UserOAuthGrantsModel({
        database,
        encryptionUtil,
        userModel: {
            getRefreshToken: async () => {
                throw new Error('No Google Sheets grant');
            },
        },
    });
    const store: GrantStore = {
        find: () => findGoogleGrant(database),
        upsert: (grant) => model.upsertGrant(grant),
        decrypt: (token) => encryptionUtil.decrypt(token),
    };
    try {
        if (action === 'seed') {
            await seedGoogleGrant(refreshToken, store);
            return undefined;
        }
        return await readConnectedGoogleGrant(store);
    } finally {
        await database.destroy();
    }
}

if (require.main === module) {
    void main()
        .then((token) => {
            if (token !== undefined) process.stdout.write(token);
        })
        .catch(() => {
            console.error(
                'Rainbow Google Sheets grant command failed. For export, reconnect the shared test account with only the Google Sheets permissions.',
            );
            process.exitCode = 1;
        });
}
