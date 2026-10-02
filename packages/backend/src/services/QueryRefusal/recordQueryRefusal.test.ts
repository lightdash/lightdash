import {
    FeatureFlags,
    QueryCredentialKind,
    QueryRefusalReason,
    QuerySurface,
    type Account,
} from '@lightdash/common';
import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { logAuditEvent } from '../../logging/winston';
import { recordQueryRefusal } from './recordQueryRefusal';

vi.mock('../../logging/winston', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../../logging/winston')>()),
    logAuditEvent: vi.fn(),
}));
vi.mock('../../logging/caslAuditWrapper', () => ({
    createActorFromAccount: vi.fn(() => ({
        type: 'session',
        uuid: 'user-1',
        organizationUuid: 'org-1',
        organizationRole: 'admin',
    })),
}));

describe('recordQueryRefusal', () => {
    const account = {
        user: { id: 'user-1' },
        isRegisteredUser: () => true,
    } as unknown as Account;
    const get = vi.fn();
    const track = vi.fn();
    const args = {
        account,
        featureFlagModel: { get },
        analytics: { track },
        organizationUuid: 'org-1',
        projectUuid: 'project-1',
        surface: QuerySurface.MCP,
        aiClient: 'test-client',
        warehouseConnectionUuid: 'connection-1',
        credentialKind: QueryCredentialKind.PERSONAL,
        credentialUuid: 'credential-1',
        reason: QueryRefusalReason.BLOCKED_FOR_AI,
        sql: 'select secret from data',
    } as unknown as Parameters<typeof recordQueryRefusal>[0];

    beforeEach(() => {
        vi.clearAllMocks();
        get.mockResolvedValue({ enabled: true });
    });

    it('writes a denied audit and a typed event with a hash only', async () => {
        await recordQueryRefusal(args);

        expect(get).toHaveBeenCalledWith({
            user: { organizationUuid: 'org-1', userUuid: 'user-1' },
            featureFlagId: FeatureFlags.QueryProvenance,
        });
        expect(logAuditEvent).toHaveBeenCalledOnce();
        const hash = createHash('sha256').update(args.sql!).digest('hex');
        expect(track).toHaveBeenCalledExactlyOnceWith({
            userId: 'user-1',
            event: 'query.refused',
            properties: expect.objectContaining({
                reason: QueryRefusalReason.BLOCKED_FOR_AI,
                sqlHash: hash,
                surface: QuerySurface.MCP,
                aiClient: 'test-client',
            }),
        });
        expect(
            JSON.stringify(vi.mocked(logAuditEvent).mock.calls),
        ).not.toContain(args.sql);
        expect(JSON.stringify(track.mock.calls)).not.toContain(args.sql);
    });

    it('does nothing when the flag is off', async () => {
        get.mockResolvedValue({ enabled: false });
        await recordQueryRefusal(args);
        expect(logAuditEvent).not.toHaveBeenCalled();
        expect(track).not.toHaveBeenCalled();
    });

    it('swallows audit failures', async () => {
        vi.mocked(logAuditEvent).mockImplementationOnce(() => {
            throw new Error('audit unavailable');
        });
        await expect(recordQueryRefusal(args)).resolves.toBeUndefined();
        expect(track).toHaveBeenCalledOnce();
    });
});
