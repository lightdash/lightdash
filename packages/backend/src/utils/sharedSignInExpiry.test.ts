import {
    BigqueryTokenError,
    DatabricksTokenError,
    ForbiddenError,
    PersonSignInProvider,
    SignInSubjectBasis,
    SnowflakeTokenError,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    attributeClientErrors,
    personaliseSharedSignInError,
    withSharedSignInExpiry,
} from './sharedSignInExpiry';

const expiry = {
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
        const attributed = withSharedSignInExpiry(error, expiry, null);
        expect(attributed).toBeInstanceOf(error.constructor);
        expect(attributed.statusCode).toBe(401);
        expect(attributed.message).toBe(
            "This project's connection uses Sam Rivera's sign-in, which has expired. Ask Sam Rivera or an admin to reconnect.",
        );
        expect(attributed.data).toEqual({ sharedSignIn: expiry });
    });
});

describe('personaliseSharedSignInError', () => {
    const attributed = withSharedSignInExpiry(
        new BigqueryTokenError('raw'),
        expiry,
        null,
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
            null,
        );
        expect(personaliseSharedSignInError(guessed, 'subject').message).toBe(
            "This project's Google sign-in has expired. You created this project. Reconnect it in Project settings → Connection settings.",
        );
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
