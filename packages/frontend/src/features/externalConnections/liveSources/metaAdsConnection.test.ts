import { ApiConnectorType } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { META_ADS_TOKEN_FORM } from './metaAdsConnection';
import {
    toTokenLiveSourceCreatePayload,
    toTokenLiveSourceUpdatePayload,
} from './tokenLiveSource';

const values = {
    name: ' Meta Ads ',
    accountId: ' act_123456 ',
    token: ' token ',
};

describe('metaAdsConnection', () => {
    it('accepts the act_ form Ads Manager shows', () => {
        expect(META_ADS_TOKEN_FORM.account.normalize('act_123')).toBe('123');
        expect(META_ADS_TOKEN_FORM.account.normalize('123')).toBe('123');
    });

    it('creates a token-authenticated source for the ad account', () => {
        expect(
            toTokenLiveSourceCreatePayload(META_ADS_TOKEN_FORM, values),
        ).toMatchObject({
            name: 'Meta Ads',
            type: 'bearer_token',
            origin: 'https://graph.facebook.com',
            secret: 'token',
            apiSource: {
                connector: ApiConnectorType.META_ADS,
                adAccountId: '123456',
            },
            allowedMethods: ['GET'],
            allowedPathPrefixes: ['/v25.0/act_123456/insights'],
        });
    });

    it('keeps the saved token when the field is blank', () => {
        expect(
            toTokenLiveSourceUpdatePayload(META_ADS_TOKEN_FORM, {
                ...values,
                token: '  ',
            }),
        ).not.toHaveProperty('secret');
        expect(
            toTokenLiveSourceUpdatePayload(META_ADS_TOKEN_FORM, values),
        ).toHaveProperty('secret', 'token');
    });

    it('asks for the numeric account id', () => {
        const { isValid } = META_ADS_TOKEN_FORM.account;
        expect(isValid('123456')).toBe(true);
        expect(isValid('act_123456')).toBe(false);
        expect(isValid('')).toBe(false);
    });
});
