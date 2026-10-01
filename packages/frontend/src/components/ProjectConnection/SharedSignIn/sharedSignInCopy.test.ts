import { PersonSignInProvider, WarehouseTypes } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    getFirstSchedulePrompt,
    getSharedSignInExpiry,
    getRunsAsLabel,
    getServiceMethods,
} from './sharedSignInCopy';

describe('getRunsAsLabel', () => {
    it('names the owner and the sign-in', () => {
        expect(
            getRunsAsLabel({
                signIn: PersonSignInProvider.GOOGLE,
                owner: { userUuid: 'u', name: 'Fran Founder' },
            }),
        ).toBe("Runs as Fran Founder's Google sign-in");
    });

    it('still says it is a person when the owner is unknown', () => {
        expect(
            getRunsAsLabel({
                signIn: PersonSignInProvider.SNOWFLAKE,
                owner: null,
            }),
        ).toBe("Runs as a person's Snowflake sign-in");
        expect(
            getRunsAsLabel({
                signIn: PersonSignInProvider.DATABRICKS,
                owner: { userUuid: 'u', name: ' ' },
            }),
        ).toBe("Runs as a person's Databricks sign-in");
    });
});

describe('getServiceMethods', () => {
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

describe('getFirstSchedulePrompt', () => {
    it('says whose sign-in the schedule runs on and what to do', () => {
        expect(
            getFirstSchedulePrompt({
                signIn: PersonSignInProvider.GOOGLE,
                owner: { userUuid: 'u', name: 'Sam Rivera' },
            }),
        ).toBe(
            "This schedule runs on Sam Rivera's Google sign-in. If that sign-in expires, the schedule stops. Add a service account to keep it running.",
        );
    });
});

describe('getSharedSignInExpiry', () => {
    it('reads the attributed sign-in from an API error', () => {
        const sharedSignIn = {
            provider: PersonSignInProvider.GOOGLE,
            ownerUserUuid: 'u',
            ownerName: 'Sam Rivera',
        };
        expect(getSharedSignInExpiry({ data: { sharedSignIn } })).toEqual(
            sharedSignIn,
        );
        expect(getSharedSignInExpiry({ data: {} })).toBeNull();
    });
});
