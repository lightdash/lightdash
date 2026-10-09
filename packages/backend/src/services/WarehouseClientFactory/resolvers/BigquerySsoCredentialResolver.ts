import {
    assertUnreachable,
    UnexpectedServerError,
    type CreateBigqueryCredentials,
} from '@lightdash/common';
import { createHash } from 'node:crypto';
import type { LightdashConfig } from '../../../config/parseConfig';
import {
    assertValidPersistedBigquerySsoKeyfile,
    hydrateBigquerySsoKeyfile,
} from '../../../utils/bigquerySsoCredentials';
import type {
    CredentialResolution,
    CredentialResolver,
    CredentialSaveInput,
    CredentialSelection,
    ValidatedCredential,
} from '../CredentialResolver';

type SavePorts = {
    getRefreshToken: (userUuid: string) => Promise<string>;
    validateRefreshToken: (refreshToken: string) => Promise<unknown>;
};

export class BigquerySsoCredentialResolver implements CredentialResolver<CreateBigqueryCredentials> {
    constructor(
        private readonly getGoogleConfig: () => LightdashConfig['auth']['google'],
        private readonly savePorts: SavePorts | null,
    ) {}

    private get google(): LightdashConfig['auth']['google'] {
        return this.getGoogleConfig();
    }

    async validateOnSave(
        input: CredentialSaveInput<CreateBigqueryCredentials>,
    ): Promise<ValidatedCredential<CreateBigqueryCredentials>> {
        let credentials = input.connection;
        const { intent } = input;
        let refreshToken: string;
        switch (intent.kind) {
            case 'preserve':
                break;
            case 'linkCurrentPerson':
                if (this.savePorts === null)
                    throw new UnexpectedServerError(
                        'Google credential validation is not configured',
                    );
                refreshToken = await this.savePorts.getRefreshToken(
                    intent.userUuid,
                );
                await this.savePorts.validateRefreshToken(refreshToken);
                credentials = {
                    ...credentials,
                    keyfileContents: {
                        type: 'authorized_user',
                        client_id: this.google.oauth2ClientId!,
                        client_secret: this.google.oauth2ClientSecret!,
                        refresh_token: refreshToken,
                    },
                };
                break;
            case 'verifiedGoogleCallback':
                credentials = {
                    ...credentials,
                    keyfileContents: {
                        type: 'authorized_user',
                        client_id: this.google.oauth2ClientId!,
                        client_secret: this.google.oauth2ClientSecret!,
                        refresh_token: intent.refreshToken,
                    },
                };
                break;
            default:
                return assertUnreachable(
                    intent,
                    'Unknown credential save intent',
                );
        }
        assertValidPersistedBigquerySsoKeyfile(credentials.keyfileContents);
        const stored = {
            ...credentials,
            keyfileContents: { ...credentials.keyfileContents },
        };
        return { connection: stored, stored };
    }

    async resolve(
        input: CredentialSelection<CreateBigqueryCredentials>,
    ): Promise<CredentialResolution<CreateBigqueryCredentials>> {
        return {
            clientCredentials: {
                ...input.connection,
                keyfileContents: hydrateBigquerySsoKeyfile(
                    input.stored.keyfileContents,
                    this.google,
                ),
            },
            clientOptions: {},
            agentSignIn: null,
            cacheable: true,
        };
    }

    cacheKeyIdentity(
        input: CredentialSelection<CreateBigqueryCredentials>,
    ): readonly (string | null)[] {
        return [
            'bigquery-sso-v1',
            input.owner?.kind ?? null,
            input.owner?.uuid ?? null,
            input.stored.keyfileContents.client_id ?? null,
            createHash('sha256')
                .update(input.stored.keyfileContents.refresh_token ?? '')
                .digest('hex'),
        ];
    }

    async dispose(): Promise<void> {}
}
