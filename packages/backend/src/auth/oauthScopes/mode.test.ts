import { FeatureFlags } from '@lightdash/common';
import { FeatureFlagModel } from '../../models/FeatureFlagModel/FeatureFlagModel';
import { isReadOnlyOAuthGrant, resolveOAuthScopeMode } from './mode';

describe('resolveOAuthScopeMode', () => {
    const user = {
        userUuid: 'user-uuid',
        organizationUuid: 'organization-uuid',
    };

    it.each([
        [false, false, null],
        [false, true, null],
        [true, false, 'log'],
        [true, true, 'enforce'],
    ] as const)(
        'resolves identity=%s enforcement=%s to %s',
        async (identity, enforcement, expected) => {
            const get = vi
                .fn<FeatureFlagModel['get']>()
                .mockImplementation(async ({ featureFlagId }) => ({
                    id: featureFlagId,
                    enabled:
                        featureFlagId === FeatureFlags.AgentIdentity
                            ? identity
                            : enforcement,
                }));
            await expect(resolveOAuthScopeMode({ get }, user)).resolves.toBe(
                expected,
            );
            expect(get).toHaveBeenNthCalledWith(1, {
                user,
                featureFlagId: FeatureFlags.AgentIdentity,
            });
            if (identity) {
                expect(get).toHaveBeenNthCalledWith(2, {
                    user,
                    featureFlagId: FeatureFlags.OAuthScopeEnforcement,
                });
            } else {
                expect(get).toHaveBeenCalledTimes(1);
            }
        },
    );
});

describe('isReadOnlyOAuthGrant', () => {
    it.each([
        [['read'], true],
        [['mcp:read'], true],
        [['read', 'mcp:read'], true],
        [[], false],
        [['write'], false],
        [['mcp:write'], false],
        [['mcp:read', 'write'], false],
        [['read', 'write', 'mcp:read', 'mcp:write'], false],
    ])('%j -> %s', (scopes, expected) => {
        expect(isReadOnlyOAuthGrant(scopes)).toBe(expected);
    });
});
