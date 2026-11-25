import { matchesLiveSourceAccessRule } from './liveSourceAccess';

describe('matchesLiveSourceAccessRule', () => {
    const rule = {
        required: { team: ['sales', 'support'] },
        any: { region: ['emea'], tier: ['gold'] },
    };

    it.each([
        ['everyone, for an empty rule', { required: {}, any: {} }, {}, true],
        [
            'someone matching all and one of any',
            rule,
            { team: ['sales'], tier: ['gold'] },
            true,
        ],
        [
            'someone missing a required attribute',
            rule,
            { region: ['emea'] },
            false,
        ],
        ['someone matching none of any', rule, { team: ['support'] }, false],
        [
            'someone with a required attribute only',
            { required: { team: ['sales'] }, any: {} },
            { team: ['sales'] },
            true,
        ],
    ])('lets in %s: %s', (_who, accessRule, attributes, expected) => {
        expect(matchesLiveSourceAccessRule(accessRule, attributes)).toBe(
            expected,
        );
    });
});
