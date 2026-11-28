import { scrubSecrets } from './scrubSecrets';

describe('scrubSecrets', () => {
    it('redacts Stripe secret and restricted keys', () => {
        expect(
            scrubSecrets(
                'tried rk_live_51Habcdefghijkl and sk_test_51Habcdefghijkl',
            ),
        ).toBe('tried [redacted] and [redacted]');
    });

    it('keeps Stripe publishable keys and object ids', () => {
        expect(scrubSecrets('pk_live_51Habcdefghijkl ch_3Habcdefghijkl')).toBe(
            'pk_live_51Habcdefghijkl ch_3Habcdefghijkl',
        );
    });
});
