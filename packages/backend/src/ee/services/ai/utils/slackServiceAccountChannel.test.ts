import { describe, expect, it } from 'vitest';
import { getSlackServiceAccountRefusal } from './slackServiceAccountChannel';

const publicChannel = {
    is_ext_shared: false,
    is_pending_ext_shared: false,
};
const member = { team_id: 'T1', is_restricted: false };

const check = (
    channel: Parameters<typeof getSlackServiceAccountRefusal>[0]['channel'] & {
        is_private?: boolean;
    },
    sender: Parameters<typeof getSlackServiceAccountRefusal>[0]['sender'],
    enterpriseId: string | null = null,
) =>
    getSlackServiceAccountRefusal({
        channel,
        sender,
        teamId: 'T1',
        enterpriseId,
    });

describe('getSlackServiceAccountRefusal', () => {
    it('allows a workspace member in a public internal channel', () => {
        expect(check(publicChannel, member)).toBeNull();
    });

    it('allows private channels', () => {
        expect(
            check({ ...publicChannel, is_private: true }, member),
        ).toBeNull();
    });

    it('refuses direct messages', () => {
        expect(check({ ...publicChannel, is_im: true }, member)).toBe(
            'direct_message',
        );
        expect(check({ ...publicChannel, is_mpim: true }, member)).toBe(
            'direct_message',
        );
    });

    it('refuses channels shared outside the workspace', () => {
        expect(check({ ...publicChannel, is_ext_shared: true }, member)).toBe(
            'external_channel',
        );
        expect(
            check({ ...publicChannel, is_pending_ext_shared: true }, member),
        ).toBe('external_channel');
    });

    it('refuses guests and bots', () => {
        expect(check(publicChannel, { ...member, is_restricted: true })).toBe(
            'guest_sender',
        );
        expect(
            check(publicChannel, { ...member, is_ultra_restricted: true }),
        ).toBe('guest_sender');
        expect(check(publicChannel, { ...member, is_bot: true })).toBe(
            'guest_sender',
        );
    });

    it('refuses users from other workspaces unless in the same enterprise', () => {
        const other = {
            team_id: 'T2',
            enterprise_user: { enterprise_id: 'E1' },
        };
        expect(check(publicChannel, other)).toBe('external_sender');
        expect(check(publicChannel, other, 'E2')).toBe('external_sender');
        expect(check(publicChannel, other, 'E1')).toBeNull();
    });
});
