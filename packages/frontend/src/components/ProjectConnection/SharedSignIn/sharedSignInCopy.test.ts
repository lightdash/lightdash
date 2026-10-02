import {
    BigqueryAuthenticationType,
    DatabricksAuthenticationType,
    SnowflakeAuthenticationType,
    PersonSignInProvider,
    SignInSubjectBasis,
    WarehouseTypes,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    canUseServiceCredentialForPeople,
    getRunsAsLabel,
    getSchedulePrompt,
    getSetupLine,
    getServiceMethods,
    isPersonSignInMethod,
    SHARED_SIGN_IN_REFUSAL_MESSAGE,
    shouldOfferFirstServiceCredentialChoice,
    getSharedSignInExpiry,
    getStopsWorkingLabel,
    isSharedSignInModalError,
    shouldOpenSharedSignInReconnectModal,
} from './sharedSignInCopy';

describe('getSetupLine', () => {
    it.each([
        [PersonSignInProvider.GOOGLE, 'Google'],
        [PersonSignInProvider.SNOWFLAKE, 'Snowflake'],
        [PersonSignInProvider.DATABRICKS, 'Databricks'],
    ])('names the %s sign-in each teammate uses', (provider, label) => {
        expect(getSetupLine(provider)).toBe(
            `Teammates sign in with their own ${label} account. Add a service account for schedules and shared work.`,
        );
    });
});

describe('getSchedulePrompt', () => {
    const recorded = {
        provider: PersonSignInProvider.GOOGLE,
        subject: { userUuid: 'sam', name: 'Sam Rivera' },
        subjectBasis: SignInSubjectBasis.RECORDED,
    };
    const ending =
        'If it expires, the schedule stops. Add a service account to keep it running.';

    it('uses your own sign-in for a personal-only connection', () => {
        expect(getSchedulePrompt(null, 'alex')).toBe(
            `This schedule runs on your own sign-in. ${ending}`,
        );
    });

    it('uses your own sign-in for a recorded current user', () => {
        expect(getSchedulePrompt(recorded, 'sam')).toBe(
            `This schedule runs on your own sign-in. ${ending}`,
        );
    });

    it('names a recorded other person', () => {
        expect(getSchedulePrompt(recorded, 'alex')).toBe(
            `This schedule runs on Sam Rivera's Google sign-in. ${ending}`,
        );
    });

    it('does not attribute a creator guess to that person', () => {
        expect(
            getSchedulePrompt(
                {
                    ...recorded,
                    subjectBasis: SignInSubjectBasis.PROJECT_CREATOR,
                },
                'alex',
            ),
        ).toBe(
            `This schedule runs on this project's shared Google sign-in. ${ending}`,
        );
    });

    it('uses neutral copy when nobody is known', () => {
        expect(
            getSchedulePrompt(
                { ...recorded, subject: null, subjectBasis: null },
                'alex',
            ),
        ).toBe(
            `This schedule runs on this project's shared Google sign-in. ${ending}`,
        );
        expect(
            getSchedulePrompt({ ...recorded, subject: null }, undefined),
        ).toBe(
            `This schedule runs on this project's shared Google sign-in. ${ending}`,
        );
    });
});

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

describe('getRunsAsLabel', () => {
    it('names a recorded subject', () => {
        expect(
            getRunsAsLabel({
                provider: PersonSignInProvider.GOOGLE,
                subject: { userUuid: 'u', name: 'Fran Founder' },
                subjectBasis: SignInSubjectBasis.RECORDED,
            }),
        ).toBe("Runs as Fran Founder's Google sign-in.");
    });

    it('describes a creator guess without assigning ownership', () => {
        expect(
            getRunsAsLabel({
                provider: PersonSignInProvider.SNOWFLAKE,
                subject: { userUuid: 'u', name: 'Fran Founder' },
                subjectBasis: SignInSubjectBasis.PROJECT_CREATOR,
            }),
        ).toBe(
            "Runs as a person's Snowflake sign-in. Fran Founder created this project.",
        );
    });

    it('still says it is a person when nobody is known', () => {
        expect(
            getRunsAsLabel({
                provider: PersonSignInProvider.DATABRICKS,
                subject: null,
                subjectBasis: null,
            }),
        ).toBe("Runs as a person's Databricks sign-in.");
    });
});

describe('getStopsWorkingLabel', () => {
    it('gives the date when there is one', () => {
        expect(getStopsWorkingLabel('2026-12-31T00:00:00.000Z')).toBe(
            'This stops working on 31 December 2026.',
        );
    });

    it('says it will stop without a date', () => {
        expect(getStopsWorkingLabel(null)).toBe(
            'This will stop working. A shared credential can only be a service account.',
        );
    });
});

describe('getServiceMethods', () => {
    it('limits fallback to warehouses with optional personal credentials', () => {
        expect(canUseServiceCredentialForPeople(WarehouseTypes.BIGQUERY)).toBe(
            true,
        );
        expect(
            canUseServiceCredentialForPeople(WarehouseTypes.DATABRICKS),
        ).toBe(true);
        expect(canUseServiceCredentialForPeople(WarehouseTypes.SNOWFLAKE)).toBe(
            false,
        );
    });
    it('lists a method without a long-lived key first', () => {
        expect(
            getServiceMethods(WarehouseTypes.ATHENA).map(({ label }) => label),
        ).toEqual(['IAM role with assume-role', 'Access keys']);
    });

    it("offers each sign-in warehouse's existing service method", () => {
        expect(getServiceMethods(WarehouseTypes.BIGQUERY)).toHaveLength(1);
        expect(getServiceMethods(WarehouseTypes.SNOWFLAKE)).toHaveLength(1);
        expect(getServiceMethods(WarehouseTypes.DATABRICKS)).toHaveLength(1);
        expect(getServiceMethods(WarehouseTypes.POSTGRES)).toEqual([]);
    });
});

describe('personal sign-in form methods', () => {
    it('recognizes a person method before it contains a token', () => {
        expect(
            isPersonSignInMethod({
                type: WarehouseTypes.BIGQUERY,
                authenticationType: BigqueryAuthenticationType.SSO,
                project: 'p',
                dataset: 'd',
                keyfileContents: {},
            } as never),
        ).toBe(true);
        expect(
            isPersonSignInMethod({
                type: WarehouseTypes.DATABRICKS,
                authenticationType: DatabricksAuthenticationType.OAUTH_M2M,
            } as never),
        ).toBe(false);
    });

    it('explains why a shared sign-in is refused', () => {
        expect(SHARED_SIGN_IN_REFUSAL_MESSAGE).toContain(
            'Sign in with your own account',
        );
    });

    it('offers the first service choice during project creation and after a secret-free connection', () => {
        const service = {
            type: WarehouseTypes.BIGQUERY,
            authenticationType: BigqueryAuthenticationType.PRIVATE_KEY,
        } as never;
        expect(
            shouldOfferFirstServiceCredentialChoice(
                service,
                true,
                false,
                undefined,
            ),
        ).toBe(true);
        expect(
            shouldOfferFirstServiceCredentialChoice(service, true, true, false),
        ).toBe(true);
        expect(
            shouldOfferFirstServiceCredentialChoice(service, true, true, true),
        ).toBe(false);
        expect(
            shouldOfferFirstServiceCredentialChoice(
                service,
                false,
                false,
                undefined,
            ),
        ).toBe(false);
        expect(
            shouldOfferFirstServiceCredentialChoice(
                {
                    type: WarehouseTypes.SNOWFLAKE,
                    authenticationType: SnowflakeAuthenticationType.NONE,
                } as never,
                true,
                false,
                undefined,
            ),
        ).toBe(false);
    });
});
