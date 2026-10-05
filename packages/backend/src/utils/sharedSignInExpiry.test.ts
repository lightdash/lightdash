import {
    BigqueryAuthenticationType,
    BigqueryTokenError,
    DatabricksTokenError,
    ForbiddenError,
    getExpiredSharedSignInMessage,
    PersonSignInProvider,
    SignInSubjectBasis,
    SnowflakeTokenError,
    WarehouseTypes,
    type Account,
} from '@lightdash/common';
import { describe, expect, it, vi } from 'vitest';
import type { FeatureFlagModel } from '../models/FeatureFlagModel/FeatureFlagModel';
import type { ProjectModel } from '../models/ProjectModel/ProjectModel';
import {
    attributeClientErrors,
    personaliseSharedSignInError,
    personaliseStoredSharedSignInError,
    withSharedSignInExpiry,
} from './sharedSignInExpiry';

const expiry = {
    projectUuid: 'project-uuid',
    provider: PersonSignInProvider.GOOGLE,
    subjectUserUuid: 'subject',
    subjectName: 'Sam Rivera',
    subjectBasis: SignInSubjectBasis.RECORDED,
};

describe('withSharedSignInExpiry', () => {
    it.each([
        new BigqueryTokenError('raw'),
        new SnowflakeTokenError('raw'),
        new DatabricksTokenError('raw'),
    ])('keeps the error class and names the subject: $name', (error) => {
        const attributed = withSharedSignInExpiry(error, expiry, 'teammate');
        expect(attributed).toBeInstanceOf(error.constructor);
        expect(attributed.statusCode).toBe(401);
        expect(attributed.message).toBe(
            "This project's connection uses Sam Rivera's sign-in, which has expired. Ask Sam Rivera or an admin to reconnect.",
        );
        expect(attributed.data).toEqual({ sharedSignIn: expiry });
    });
});

describe('personaliseStoredSharedSignInError', () => {
    const generic = getExpiredSharedSignInMessage(expiry, null);
    const account = {
        user: { id: 'subject' },
        organization: { organizationUuid: 'organization-uuid' },
        isRegisteredUser: () => true,
        isSessionUser: () => true,
        isPatUser: () => false,
    } as unknown as Account;
    const projectModel = {
        getWarehouseCredentialsForProject: vi.fn(async () => ({
            type: WarehouseTypes.BIGQUERY,
            authenticationType: BigqueryAuthenticationType.SSO,
            keyfileContents: {
                type: 'authorized_user',
                refresh_token: 'token',
            },
        })),
        getSharedSignInSubjectForToken: vi.fn(async () => ({
            provider: PersonSignInProvider.GOOGLE,
            subject: { userUuid: 'subject', name: 'Sam Rivera' },
            basis: SignInSubjectBasis.RECORDED,
        })),
    } as unknown as ProjectModel;
    const featureFlagModel = {
        get: vi.fn(async () => ({ enabled: true })),
    } as unknown as FeatureFlagModel;
    const read = (viewer: Account, error = generic) =>
        personaliseStoredSharedSignInError({
            account: viewer,
            projectUuid: expiry.projectUuid,
            error,
            projectModel,
            featureFlagModel,
        });

    it('personalises the generic error for a registered member', async () => {
        await expect(read(account)).resolves.toBe(
            "Your Google sign-in for this project's connection has expired. Reconnect it in the project's connection settings.",
        );
        await expect(
            read({
                ...account,
                isSessionUser: () => false,
                isPatUser: () => true,
            } as Account),
        ).resolves.toBe(
            "Your Google sign-in for this project's connection has expired. Reconnect it in the project's connection settings.",
        );
    });

    it('keeps the generic error for an embed or anonymous account', async () => {
        const embed = {
            ...account,
            isSessionUser: () => false,
            isPatUser: () => false,
        } as Account;
        const anonymous = {
            ...account,
            isRegisteredUser: () => false,
        } as Account;
        await expect(read(embed)).resolves.toBe(generic);
        await expect(read(anonymous)).resolves.toBe(generic);
    });

    it('returns the stored message when the kill switch is off', async () => {
        vi.mocked(featureFlagModel.get).mockResolvedValueOnce({
            enabled: false,
        } as never);
        await expect(read(account)).resolves.toBe(generic);
    });
});

describe('personaliseSharedSignInError', () => {
    const attributed = withSharedSignInExpiry(
        new BigqueryTokenError('raw'),
        expiry,
        'teammate',
    );

    it('tells the subject to reconnect', () => {
        expect(
            personaliseSharedSignInError(attributed, 'subject').message,
        ).toBe(
            "Your Google sign-in for this project's connection has expired. Reconnect it in the project's connection settings.",
        );
    });

    it('tells a guessed creator to reconnect without assigning ownership', () => {
        const guessed = withSharedSignInExpiry(
            new BigqueryTokenError('raw'),
            { ...expiry, subjectBasis: SignInSubjectBasis.PROJECT_CREATOR },
            'teammate',
        );
        expect(personaliseSharedSignInError(guessed, 'subject').message).toBe(
            "This project's Google sign-in has expired. You created this project. Reconnect it in Project settings → Connection settings.",
        );
    });

    it('hides names and subject identifiers from an anonymous viewer', () => {
        const anonymous = personaliseSharedSignInError(attributed, null);
        expect(anonymous.message).toBe(
            "This project's connection uses a Google sign-in that has expired. Ask a project admin to reconnect it in Project settings → Connection settings.",
        );
        expect(anonymous.data.sharedSignIn).toEqual({
            ...expiry,
            subjectUserUuid: null,
            subjectName: null,
        });
    });

    it('leaves other errors and unattributed token errors alone', () => {
        const forbidden = new ForbiddenError('no');
        const raw = new BigqueryTokenError('raw');
        expect(personaliseSharedSignInError(forbidden, 'subject')).toBe(
            forbidden,
        );
        expect(personaliseSharedSignInError(raw, 'subject')).toBe(raw);
    });
});

describe('attributeClientErrors', () => {
    class FakeClient {
        private readonly secret = 'kept';

        async runQuery(): Promise<string> {
            throw new BigqueryTokenError(this.secret);
        }

        async test(): Promise<string> {
            return this.secret;
        }

        getName(): string {
            return 'fake';
        }
    }

    it('passes rejected calls through the handler and keeps everything else', async () => {
        const client = attributeClientErrors(new FakeClient(), async () => {
            throw new Error('attributed');
        });
        await expect(client.runQuery()).rejects.toThrow('attributed');
        await expect(client.test()).resolves.toBe('kept');
        expect(client.getName()).toBe('fake');
        expect(client).toBeInstanceOf(FakeClient);
    });
});
