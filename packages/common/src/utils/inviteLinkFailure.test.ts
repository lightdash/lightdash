import { describe, expect, it } from 'vitest';
import { InviteLinkFailureReason } from '../types/api';
import { getInviteLinkFailureReason } from './inviteLinkFailure';

describe('getInviteLinkFailureReason', () => {
    it.each([
        [
            'ExpiredError',
            'Invite link expired',
            InviteLinkFailureReason.Expired,
        ],
        [
            'NotFoundError',
            'No invite link found',
            InviteLinkFailureReason.NotFound,
        ],
        [
            'AuthorizationError',
            'Provided email person@example.com does not match the invited email.',
            InviteLinkFailureReason.WrongEmail,
        ],
        [
            null,
            'Provided email person@example.com does not match the invited email.',
            InviteLinkFailureReason.WrongEmail,
        ],
        ['AuthorizationError', 'User session not found', null],
        ['ForbiddenError', 'Sign-in is not allowed', null],
        [null, 'Authentication failed', null],
    ])('classifies %s: %s', (name, message, expected) => {
        expect(getInviteLinkFailureReason(name, message)).toBe(expected);
    });
});
