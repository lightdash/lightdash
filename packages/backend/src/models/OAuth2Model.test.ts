import { AnyType } from '@lightdash/common';
import { OAuth2Model } from './OAuth2Model';

describe('OAuth2Model.validateRedirectUri', () => {
    const model = new OAuth2Model({} as AnyType);
    const client = {
        redirectUris: [
            'http://localhost:8100/callback',
            'http://localhost:*/callback',
            'https://example.com/*',
        ],
    };

    it('returns true for exact match', async () => {
        const result = await model.validateRedirectUri(
            'http://localhost:8100/callback',
            client as AnyType,
        );
        expect(result).toBe(true);
    });

    it('returns true for wildcard match', async () => {
        const result = await model.validateRedirectUri(
            'http://localhost:9999/callback',
            client as AnyType,
        );
        expect(result).toBe(true);
    });

    it('returns true for wildcard path match', async () => {
        const result = await model.validateRedirectUri(
            'https://example.com/anything',
            client as AnyType,
        );
        expect(result).toBe(true);
    });

    it('returns false for non-wildcard port uri', async () => {
        const result = await model.validateRedirectUri(
            'https://example.com:8100/anything',
            client as AnyType,
        );
        expect(result).toBe(false);
    });

    it('returns false for non-matching uri', async () => {
        const result = await model.validateRedirectUri(
            'http://malicious.com/callback',
            client as AnyType,
        );
        expect(result).toBe(false);
    });

    it('returns false for partial match', async () => {
        const result = await model.validateRedirectUri(
            'http://localhost:8100/other',
            client as AnyType,
        );
        expect(result).toBe(false);
    });
});
