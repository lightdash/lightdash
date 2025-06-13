import { ServiceAccountScope, hasRequiredScopes } from './types';

describe('ServiceAccountScope', () => {
    describe('hasRequiredScopes', () => {
        it('should return true when service account has all required scopes', () => {
            const serviceAccountScopes = [
                ServiceAccountScope.ORG_ADMIN,
                ServiceAccountScope.SCIM_MANAGE,
            ];
            const requiredScopes = [ServiceAccountScope.ORG_ADMIN];

            expect(
                hasRequiredScopes(serviceAccountScopes, requiredScopes),
            ).toBe(true);
        });

        it('should return true when service account has parent scopes', () => {
            const serviceAccountScopes = [ServiceAccountScope.ORG_ADMIN];
            const requiredScopes = [ServiceAccountScope.ORG_READ];

            expect(
                hasRequiredScopes(serviceAccountScopes, requiredScopes),
            ).toBe(true);
        });

        it('should return false when service account is missing a required scope', () => {
            const serviceAccountScopes = [ServiceAccountScope.ORG_READ];
            const requiredScopes = [ServiceAccountScope.ORG_ADMIN];

            expect(
                hasRequiredScopes(serviceAccountScopes, requiredScopes),
            ).toBe(false);
        });

        it('should return false when service account is missing a parent scope', () => {
            const serviceAccountScopes = [ServiceAccountScope.ORG_ADMIN];
            const requiredScopes = [
                ServiceAccountScope.ORG_ADMIN,
                ServiceAccountScope.SCIM_MANAGE,
            ];

            expect(
                hasRequiredScopes(serviceAccountScopes, requiredScopes),
            ).toBe(false);
        });

        it('should return true when service account has all required scopes and their parents', () => {
            const serviceAccountScopes = [
                ServiceAccountScope.ORG_ADMIN,
                ServiceAccountScope.SCIM_MANAGE,
            ];
            const requiredScopes = [
                ServiceAccountScope.ORG_ADMIN,
                ServiceAccountScope.SCIM_MANAGE,
            ];

            expect(
                hasRequiredScopes(serviceAccountScopes, requiredScopes),
            ).toBe(true);
        });

        it('should return true when no scopes are required', () => {
            const serviceAccountScopes = [ServiceAccountScope.ORG_ADMIN];
            const requiredScopes: ServiceAccountScope[] = [];

            expect(
                hasRequiredScopes(serviceAccountScopes, requiredScopes),
            ).toBe(true);
        });

        it('should return false when service account has no scopes but scopes are required', () => {
            const serviceAccountScopes: ServiceAccountScope[] = [];
            const requiredScopes = [ServiceAccountScope.ORG_ADMIN];

            expect(
                hasRequiredScopes(serviceAccountScopes, requiredScopes),
            ).toBe(false);
        });
    });
});
