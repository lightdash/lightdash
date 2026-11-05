import { type Account } from '@lightdash/common';
import { AsyncQueryService } from './AsyncQueryService';

const embedAccount = (parameters: unknown) =>
    ({
        isJwtUser: () => true,
        isRegisteredUser: () => false,
        access: { parameters },
    }) as unknown as Account;

describe('AsyncQueryService.getAccountParameterInputs', () => {
    // Embed tokens reach the v2 dashboard query routes directly, not only through EmbedService
    it('applies the embed token rules to a direct dashboard query', () => {
        expect(
            AsyncQueryService.getAccountParameterInputs(
                embedAccount({
                    enabled: true,
                    allowedParameters: ['region'],
                    values: { currency: 'GBP' },
                }),
                { region: 'APAC', currency: 'USD' },
                ['currency'],
            ),
        ).toEqual({
            parameters: { region: 'APAC', currency: 'GBP' },
            excludedParameterKeys: undefined,
        });
    });

    it('drops the viewer values when the token has no parameter interactivity', () => {
        expect(
            AsyncQueryService.getAccountParameterInputs(
                embedAccount(undefined),
                { region: 'APAC' },
                ['region'],
            ),
        ).toEqual({ parameters: {}, excludedParameterKeys: undefined });
    });

    it('leaves a signed-in user as sent', () => {
        const account = {
            isJwtUser: () => false,
            isRegisteredUser: () => true,
        } as unknown as Account;
        expect(
            AsyncQueryService.getAccountParameterInputs(
                account,
                { region: 'APAC' },
                ['region'],
            ),
        ).toEqual({
            parameters: { region: 'APAC' },
            excludedParameterKeys: ['region'],
        });
    });
});
