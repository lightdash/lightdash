import {
    AiCreditsPausedError,
    getAiCreditsPausedMessage,
    isAiCreditHoldBlocking,
} from './holds';
import { AI_CREDIT_HOLD_REASONS } from './types';

describe('isAiCreditHoldBlocking', () => {
    test('an allowance hold only pauses AI on an enforced contract', () => {
        expect(isAiCreditHoldBlocking('allowance_exhausted', 'enforce')).toBe(
            true,
        );
        expect(isAiCreditHoldBlocking('allowance_exhausted', 'warn')).toBe(
            false,
        );
        expect(isAiCreditHoldBlocking('allowance_exhausted', null)).toBe(false);
    });

    test('every other hold pauses AI whatever the contract says', () => {
        expect(isAiCreditHoldBlocking('manual_pause', 'warn')).toBe(true);
        expect(isAiCreditHoldBlocking('trial_ended', null)).toBe(true);
        expect(isAiCreditHoldBlocking('admin_cap_reached', 'warn')).toBe(true);
    });
});

describe('getAiCreditsPausedMessage', () => {
    test('has copy for every reason and audience, without dates', () => {
        AI_CREDIT_HOLD_REASONS.forEach((reason) =>
            (['admin', 'member', 'embedViewer'] as const).forEach(
                (audience) => {
                    const message = getAiCreditsPausedMessage({
                        reason,
                        audience,
                        settingsUrl: null,
                    });
                    expect(message.length).toBeGreaterThan(0);
                    expect(message).not.toMatch(/\d{4}|resumes|until/i);
                },
            ),
        );
    });

    test('links admins to AI credits settings only when they can open it', () => {
        expect(
            getAiCreditsPausedMessage({
                reason: 'allowance_exhausted',
                audience: 'admin',
                settingsUrl:
                    'https://app.example.com/generalSettings/aiCredits',
            }),
        ).toBe(
            "This period's AI credit allowance is used up. See AI credits settings: https://app.example.com/generalSettings/aiCredits",
        );
        expect(
            getAiCreditsPausedMessage({
                reason: 'allowance_exhausted',
                audience: 'admin',
                settingsUrl: null,
            }),
        ).toBe("This period's AI credit allowance is used up.");
    });

    test('tells members to contact an admin', () => {
        expect(
            getAiCreditsPausedMessage({
                reason: 'manual_pause',
                audience: 'member',
                settingsUrl: null,
            }),
        ).toBe(
            'AI usage is paused for your organization. Contact an organization admin.',
        );
    });

    test('never tells embedded viewers why, and lets the host app override the text', () => {
        expect(
            getAiCreditsPausedMessage({
                reason: 'allowance_exhausted',
                audience: 'embedViewer',
                settingsUrl: null,
            }),
        ).toBe("AI isn't available right now.");
        expect(
            getAiCreditsPausedMessage({
                reason: 'allowance_exhausted',
                audience: 'embedViewer',
                settingsUrl: null,
                resolveUiString: () => 'Assistant indisponible',
            }),
        ).toBe('Assistant indisponible');
    });
});

describe('AiCreditsPausedError', () => {
    test('is a forbidden error that carries the hold reason', () => {
        const error = new AiCreditsPausedError({
            reason: 'trial_ended',
            message: 'Your AI trial has ended.',
        });
        expect(error.statusCode).toBe(403);
        expect(error.reason).toBe('trial_ended');
        expect(error.data).toEqual({ reason: 'trial_ended' });
    });
});
