import { describe, expect, it } from 'vitest';
import {
    getExpiredPersonalSignInMessage,
    getExpiredSharedSignInMessage,
    getWarehouseSignInErrorType,
    PersonSignInProvider,
    SignInSubjectBasis,
} from './sharedSignIn';

describe('stored warehouse sign-in error classification', () => {
    it.each(Object.values(PersonSignInProvider))(
        'recognizes controlled %s copy after string storage',
        (provider) => {
            const message = getExpiredPersonalSignInMessage({ provider });
            expect(getWarehouseSignInErrorType(message)).toMatchObject({
                provider,
                scope: 'personal',
            });
            for (const subjectBasis of [
                null,
                ...Object.values(SignInSubjectBasis),
            ]) {
                for (const viewer of [null, 'owner', 'viewer']) {
                    const shared = getExpiredSharedSignInMessage(
                        {
                            provider,
                            subjectBasis,
                            subjectUserUuid: 'owner',
                            subjectName: 'Connection owner',
                        },
                        viewer,
                    );
                    expect(getWarehouseSignInErrorType(shared)).toMatchObject({
                        provider:
                            subjectBasis === SignInSubjectBasis.RECORDED &&
                            viewer === 'viewer'
                                ? null
                                : provider,
                        scope: 'shared',
                    });
                }
            }
        },
    );
    it.each([
        'Permission denied: invalid_grant',
        'Your BigQuery sign-in has expired',
        'Token expired while reading a table',
        'Google returned invalid_grant for an unrelated operation',
        `Permission denied: ${getExpiredPersonalSignInMessage({ provider: PersonSignInProvider.GOOGLE })}`,
        `${getExpiredPersonalSignInMessage({ provider: PersonSignInProvider.GOOGLE })} Provider details`,
    ])('does not classify unrelated text: %s', (message) => {
        expect(getWarehouseSignInErrorType(message)).toBeNull();
    });
});
