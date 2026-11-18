import type { CreateEmbedJwt } from '@lightdash/common';
import { getEmbeddedUsageAttribution } from './embeddedUsage';

const attribution = (data: Partial<CreateEmbedJwt>, source = 'encoded-token') =>
    getEmbeddedUsageAttribution({
        authentication: {
            type: 'jwt',
            source,
            data: {
                content: { type: 'dashboard', dashboardUuid: 'dashboard' },
                ...data,
            },
        },
        organization: { organizationUuid: 'org' },
    });

describe('embedded usage attribution', () => {
    it('reports only the explicitly selected tenant attribute and explicit viewer', () => {
        const track = (brand: string) =>
            attribution({
                user: { externalId: 'viewer' },
                userAttributes: { brand, unrelated: 'private' },
                usageAnalytics: { tenantAttribute: 'brand' },
            });

        expect(track('a')).toEqual({
            externalUserId: 'viewer',
            tokenFingerprint: null,
            tenantAttribute: 'brand',
            tenantId: 'a',
        });
        expect(track('b')?.tenantId).toBe('b');
        expect(
            attribution({ userAttributes: { brand: 'a' } })?.tenantId,
        ).toBeNull();
        expect(
            attribution({
                usageAnalytics: { tenantAttribute: 'toString' },
                userAttributes: {},
            })?.tenantId,
        ).toBeNull();
    });

    it('accepts a singleton attribute array without assigning a multi-tenant token to one tenant', () => {
        const withBrands = (brands: string[]) =>
            attribution({
                // The embed resolver accepts arrays in signed JWTs.
                userAttributes: { brand: brands as unknown as string },
                usageAnalytics: { tenantAttribute: 'brand' },
            });
        expect(withBrands(['a'])?.tenantId).toBe('a');
        expect(withBrands(['a', 'b'])?.tenantId).toBeNull();
    });

    it('omits malformed values that PostgreSQL cannot store', () => {
        for (const brand of ['in\0valid', '\uD800']) {
            expect(
                attribution({
                    userAttributes: { brand },
                    usageAnalytics: { tenantAttribute: 'brand' },
                })?.tenantId,
            ).toBeNull();
        }
        expect(
            attribution({
                userAttributes: { brand: 'Brand 🟢' },
                usageAnalytics: { tenantAttribute: 'brand' },
            })?.tenantId,
        ).toBe('Brand 🟢');
    });

    it('uses a stable token fingerprint, leaving the viewer ID empty', () => {
        const first = attribution({});
        expect(first).toMatchObject({
            externalUserId: null,
            tokenFingerprint: expect.stringMatching(/^[0-9a-f]{64}$/u),
        });
        expect(attribution({})).toEqual(first);
        expect(attribution({}, 'another-token')?.tokenFingerprint).not.toBe(
            first?.tokenFingerprint,
        );
        expect(JSON.stringify(first)).not.toContain('encoded-token');
    });

    it('does not enrich preview tokens or registered requests', () => {
        expect(
            attribution({
                content: {
                    type: 'dashboard',
                    dashboardUuid: 'dashboard',
                    isPreview: true,
                },
            }),
        ).toBeUndefined();
        expect(
            getEmbeddedUsageAttribution({
                authentication: { type: 'session', source: 'session' },
                organization: {
                    organizationUuid: 'org',
                },
            }),
        ).toBeUndefined();
    });
});
