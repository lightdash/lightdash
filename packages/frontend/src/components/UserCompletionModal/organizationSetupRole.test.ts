import { describe, expect, it } from 'vitest';
import { getOrganizationSetupRole } from './organizationSetupRole';

describe('getOrganizationSetupRole', () => {
    it('keeps today behaviour with the flag off', () => {
        expect(
            getOrganizationSetupRole({
                isConnectJourney: false,
                userUuid: 'u',
                userOrganizationName: 'Acme',
                createdByUserUuid: 'u',
            }),
        ).toBe('legacy');
    });

    it('treats the recorded creator as the creator', () => {
        expect(
            getOrganizationSetupRole({
                isConnectJourney: true,
                userUuid: 'u',
                userOrganizationName: 'Acme',
                createdByUserUuid: 'u',
            }),
        ).toBe('creator');
    });

    it('treats anyone else as a joiner', () => {
        expect(
            getOrganizationSetupRole({
                isConnectJourney: true,
                userUuid: 'v',
                userOrganizationName: 'Acme',
                createdByUserUuid: 'u',
            }),
        ).toBe('joiner');
    });

    it('falls back to the unnamed organization for orgs with no recorded creator', () => {
        expect(
            getOrganizationSetupRole({
                isConnectJourney: true,
                userUuid: 'u',
                userOrganizationName: '',
                createdByUserUuid: null,
            }),
        ).toBe('creator');
        expect(
            getOrganizationSetupRole({
                isConnectJourney: true,
                userUuid: 'u',
                userOrganizationName: 'Acme',
                createdByUserUuid: null,
            }),
        ).toBe('joiner');
    });
});
