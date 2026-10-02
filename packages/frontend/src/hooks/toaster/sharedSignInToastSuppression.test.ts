import { PersonSignInProvider, SignInSubjectBasis } from '@lightdash/common';
import { afterEach, expect, test } from 'vitest';
import {
    clearSharedSignInToastSuppression,
    setSharedSignInToastSuppression,
    shouldSuppressSharedSignInToast,
} from './sharedSignInToastSuppression';

afterEach(() => clearSharedSignInToastSuppression('project-a'));

test('suppresses only toasts for the project with the open modal', () => {
    setSharedSignInToastSuppression(
        'project-a',
        {
            provider: PersonSignInProvider.GOOGLE,
            subject: { userUuid: 'owner', name: 'Owner' },
            subjectBasis: SignInSubjectBasis.RECORDED,
            expired: true,
            canReconnect: true,
        },
        'owner',
    );
    const error = {
        statusCode: 400,
        name: 'PreviewWarehouseSignInExpiredError',
        message: 'expired',
        data: {
            sharedSignIn: {
                provider: PersonSignInProvider.GOOGLE,
                subjectUserUuid: 'owner',
                subjectName: 'Owner',
                subjectBasis: SignInSubjectBasis.RECORDED,
            },
        },
    };

    expect(shouldSuppressSharedSignInToast(error, 'project-a')).toBe(true);
    expect(shouldSuppressSharedSignInToast(error, 'project-b')).toBe(false);
    expect(shouldSuppressSharedSignInToast(error, undefined)).toBe(false);
    setSharedSignInToastSuppression(
        'project-b',
        {
            provider: PersonSignInProvider.GOOGLE,
            subject: { userUuid: 'owner', name: 'Owner' },
            subjectBasis: SignInSubjectBasis.RECORDED,
            expired: true,
            canReconnect: true,
        },
        'owner',
    );
    expect(shouldSuppressSharedSignInToast(error, 'project-a')).toBe(false);
    clearSharedSignInToastSuppression('project-b');
});
