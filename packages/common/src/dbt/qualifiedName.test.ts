import { qualifyManifestNames } from './qualifiedName';

describe('qualifyManifestNames', () => {
    it('always applies a source namespace prefix without moving unprefixed names', () => {
        const names = qualifyManifestNames(
            [
                {
                    uniqueId: 'model.primary.orders',
                    name: 'orders',
                    lightdash_source_name: 'primary',
                    lightdash_namespace_prefix: '',
                },
                {
                    uniqueId: 'model.finance.orders',
                    name: 'orders',
                    lightdash_source_name: 'finance',
                    lightdash_namespace_prefix: 'finance',
                },
            ],
            'model',
        );

        expect(names.get('model.primary.orders')).toBe('orders');
        expect(names.get('model.finance.orders')).toBe('finance__orders');
    });

    it('does not include prefixed sources in collision qualification', () => {
        const names = qualifyManifestNames(
            [
                {
                    uniqueId: 'model.primary.customers',
                    name: 'customers',
                    lightdash_source_name: 'primary',
                },
                {
                    uniqueId: 'model.marketing.orders',
                    name: 'orders',
                    lightdash_source_name: 'marketing',
                    lightdash_namespace_prefix: 'marketing',
                },
            ],
            'model',
        );

        expect(names.get('model.primary.customers')).toBe('customers');
        expect(names.get('model.marketing.orders')).toBe('marketing__orders');
    });
});
