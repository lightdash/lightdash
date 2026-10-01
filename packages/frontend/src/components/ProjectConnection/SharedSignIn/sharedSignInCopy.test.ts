import { PersonSignInProvider, WarehouseTypes } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { getRunsAsLabel, getServiceMethods } from './sharedSignInCopy';

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
