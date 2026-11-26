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

type GoogleOAuthClient = {
    oauth2ClientId: string | undefined;
    oauth2ClientSecret: string | undefined;
};

class GoogleGrantError extends Error {
    constructor(readonly code: string) {
        super(code);
        this.name = 'GoogleGrantError';
    }
}

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
        throw new GoogleGrantError('GOOGLE_GRANT_NOT_CONNECTED');
    }
    return store.decrypt(grant.encrypted_refresh_token);
}

export async function validateGoogleGrant(
    refreshToken: string,
    google: GoogleOAuthClient,
    request: typeof fetch = fetch,
): Promise<void> {
    if (!google.oauth2ClientId || !google.oauth2ClientSecret) {
        throw new GoogleGrantError('GOOGLE_GRANT_CLIENT_MISSING');
    }
    const response = await request('https://oauth2.googleapis.com/token', {
        method: 'POST',
        body: new URLSearchParams({
            client_id: google.oauth2ClientId,
            client_secret: google.oauth2ClientSecret,
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
        }),
        redirect: 'error',
        signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) {
        throw new GoogleGrantError('GOOGLE_GRANT_REFRESH_REJECTED');
    }
    const result: unknown = await response.json().catch(() => null);
    if (
        !result ||
        typeof result !== 'object' ||
        !('access_token' in result) ||
        typeof result.access_token !== 'string' ||
        result.access_token.length === 0
    ) {
        throw new GoogleGrantError('GOOGLE_GRANT_ACCESS_TOKEN_MISSING');
    }
}

export async function exportGoogleGrant(
    store: GrantStore,
    google: GoogleOAuthClient,
    request: typeof fetch = fetch,
): Promise<string> {
    const token = await readConnectedGoogleGrant(store);
    await validateGoogleGrant(token, google, request);
    return token;
}

export async function runGoogleGrant({
    action,
    refreshToken,
    mode,
    interactive,
}: {
    action: string | undefined;
    refreshToken: string | undefined;
    mode: string | undefined;
    interactive: boolean;
}): Promise<string | undefined> {
    if (action === 'seed' && !refreshToken) return undefined;
    if (action !== 'seed' && action !== 'export') {
        throw new GoogleGrantError('GOOGLE_GRANT_INVALID_ACTION');
    }
    if (mode !== 'pr') {
        throw new GoogleGrantError('GOOGLE_GRANT_PREVIEW_ONLY');
    }
    if (action === 'export' && interactive) {
        throw new GoogleGrantError('GOOGLE_GRANT_INTERACTIVE_EXPORT');
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
                throw new GoogleGrantError('GOOGLE_GRANT_NOT_CONNECTED');
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
        return await exportGoogleGrant(store, lightdashConfig.auth.google);
    } finally {
        await database.destroy();
    }
}

export function getGoogleGrantErrorFields(error: unknown) {
    const name = error instanceof Error ? error.name : '';
    const code =
        error instanceof Error && 'code' in error ? error.code : undefined;

    return {
        name: /^[A-Za-z]{0,30}Error$/.test(name) ? name : 'UnknownError',
        code:
            typeof code === 'string' &&
            /^(?:GOOGLE_GRANT_[A-Z_]{1,32}|E[A-Z_0-9]{1,24}|[0-9A-Z]{5})$/.test(
                code,
            )
                ? code
                : 'unknown',
    };
}

if (require.main === module) {
    const action = process.argv[2];
    void runGoogleGrant({
        action,
        refreshToken: process.env.GOOGLE_SHEETS_TEST_REFRESH_TOKEN,
        mode: process.env.LIGHTDASH_MODE,
        interactive: process.stdout.isTTY === true,
    })
        .then((token) => {
            if (token !== undefined) process.stdout.write(token);
        })
        .catch((error) => {
            const { name, code } = getGoogleGrantErrorFields(error);
            const step = action === 'seed' ? ' seed' : '';
            console.error(
                `Rainbow Google Sheets grant${step} failed (${name}, ${code}).`,
            );
            if (action === 'export') {
                console.error(
                    'Reconnect the shared test account on gsheets before retrying.',
                );
            }
            process.exitCode = 1;
        });
}
