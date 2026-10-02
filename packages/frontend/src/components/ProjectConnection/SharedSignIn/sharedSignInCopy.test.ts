import { PersonSignInProvider, SignInSubjectBasis } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    getSharedSignInExpiry,
    isSharedSignInModalError,
    shouldOpenSharedSignInReconnectModal,
} from './sharedSignInCopy';

describe('getSharedSignInExpiry', () => {
    it('reads the attributed sign-in from an API error', () => {
        const sharedSignIn = {
            provider: PersonSignInProvider.GOOGLE,
            subjectUserUuid: 'u',
            subjectName: 'Sam Rivera',
            subjectBasis: 'recorded',
        };
        expect(getSharedSignInExpiry({ data: { sharedSignIn } })).toEqual(
            sharedSignIn,
        );
        expect(getSharedSignInExpiry({ data: {} })).toBeNull();
    });
});

describe('shouldOpenSharedSignInReconnectModal', () => {
    it('opens only for an expired sign-in the viewer can reconnect', () => {
        const status = {
            provider: PersonSignInProvider.GOOGLE,
            subject: null,
            subjectBasis: null,
            expired: true,
            canReconnect: true,
        };
        expect(shouldOpenSharedSignInReconnectModal(status)).toBe(true);
        expect(
            shouldOpenSharedSignInReconnectModal({
                ...status,
                canReconnect: false,
            }),
        ).toBe(false);
        expect(
            shouldOpenSharedSignInReconnectModal({ ...status, expired: false }),
        ).toBe(false);
        expect(shouldOpenSharedSignInReconnectModal(null)).toBe(false);
    });
});

describe('isSharedSignInModalError', () => {
    const status = {
        provider: PersonSignInProvider.GOOGLE,
        subject: { userUuid: 'owner', name: 'Owner' },
        subjectBasis: SignInSubjectBasis.RECORDED,
        expired: true,
        canReconnect: true,
    };
    const error = {
        message:
            "Your Google sign-in for this project's connection has expired.",
        data: {
            sharedSignIn: {
                provider: PersonSignInProvider.GOOGLE,
                subjectUserUuid: 'owner',
                subjectName: 'Owner',
                subjectBasis: SignInSubjectBasis.RECORDED,
            },
        },
    };

    it('suppresses only the attributed sign-in shown by the modal', () => {
        expect(isSharedSignInModalError(error, status, 'owner')).toBe(true);
        expect(
            isSharedSignInModalError({ ...error, data: {} }, status, 'owner'),
        ).toBe(false);
        expect(
            isSharedSignInModalError(
                error,
                {
                    ...status,
                    subject: { userUuid: 'another-person', name: 'Other' },
                },
                'owner',
            ),
        ).toBe(false);
        expect(
            isSharedSignInModalError(
                error,
                {
                    ...status,
                    subjectBasis: SignInSubjectBasis.PROJECT_CREATOR,
                },
                'owner',
            ),
        ).toBe(false);
    });

    it.each([
        [
            SignInSubjectBasis.RECORDED,
            "Your Google sign-in for this project's connection has expired. Reconnect it in the project's connection settings.",
        ],
        [
            SignInSubjectBasis.PROJECT_CREATOR,
            "This project's Google sign-in has expired. You created this project. Reconnect it in Project settings → Connection settings.",
        ],
        [
            null,
            "This project's connection uses a Google sign-in that has expired. Ask a project admin to reconnect it in Project settings → Connection settings.",
        ],
    ])(
        'suppresses a message-only error for subject basis %s',
        (subjectBasis, message) => {
            expect(
                isSharedSignInModalError(
                    { message, data: {} },
                    { ...status, subjectBasis },
                    'owner',
                ),
            ).toBe(true);
            expect(
                isSharedSignInModalError(
                    { message: `${message} Another error`, data: {} },
                    { ...status, subjectBasis },
                    'owner',
                ),
            ).toBe(false);
        },
    );
});
