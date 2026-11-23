import {
    getLiveSourceSignInRequiredMessage,
    parseLiveSourceSignInRequiredMessage,
    type LiveSourceSignInRequired,
} from './liveSourceErrors';

const signIn = (
    reason: LiveSourceSignInRequired['reason'],
): LiveSourceSignInRequired => ({
    externalConnectionUuid: '3f1c2a8e-0000-4000-8000-000000000001',
    name: 'Sales pipeline. EMEA',
    integration: 'Salesforce',
    reason,
    connectUrl:
        'https://app.example.com/api/v1/ee/projects/p-1/live-sources/3f1c2a8e-0000-4000-8000-000000000001/user-sign-in/start',
});

describe('live source sign-in messages', () => {
    it.each(['missing', 'expired'] as const)(
        'reads a %s sign-in back from its message',
        (reason) => {
            expect(
                parseLiveSourceSignInRequiredMessage(
                    getLiveSourceSignInRequiredMessage(signIn(reason)),
                ),
            ).toEqual(signIn(reason));
        },
    );

    it('reads nothing from other errors', () => {
        expect(
            parseLiveSourceSignInRequiredMessage('Hydra returned 500'),
        ).toBeNull();
        expect(
            parseLiveSourceSignInRequiredMessage(
                'X shows each person their own Y data. Connect your Y account to see it. Connect it here: https://evil.example.com/',
            ),
        ).toBeNull();
    });
});
