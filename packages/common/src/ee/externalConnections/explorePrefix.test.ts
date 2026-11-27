import { ApiConnectorType } from '../../types/querySources';
import {
    getDefaultExplorePrefix,
    getExplorePrefixError,
    getLiveObjectModelName,
    getNumberedExploreName,
} from './explorePrefix';

describe('getExplorePrefixError', () => {
    it.each(['posthog', 'web_events_2', `a${'b'.repeat(39)}`])(
        'accepts %s',
        (prefix) => {
            expect(getExplorePrefixError(prefix)).toBeNull();
        },
    );

    it.each(['', 'Web', '2web', 'web events', 'web-events', 'a'.repeat(41)])(
        'refuses "%s"',
        (prefix) => {
            expect(getExplorePrefixError(prefix)).not.toBeNull();
        },
    );
});

describe('getDefaultExplorePrefix', () => {
    it('derives a prefix from the name', () => {
        expect(
            getDefaultExplorePrefix(
                ApiConnectorType.POSTHOG,
                'Product Analytics',
            ),
        ).toBe('product_analytics');
    });

    it('falls back to the integration when the name gives no valid prefix', () => {
        expect(getDefaultExplorePrefix(ApiConnectorType.POSTHOG, '123')).toBe(
            ApiConnectorType.POSTHOG,
        );
    });

    it('trims long names without leaving a trailing underscore', () => {
        const prefix = getDefaultExplorePrefix(
            ApiConnectorType.POSTHOG,
            `${'a'.repeat(39)} tail`,
        );
        expect(prefix).toBe('a'.repeat(39));
        expect(getExplorePrefixError(prefix)).toBeNull();
    });
});

describe('getNumberedExploreName', () => {
    it('keeps the first name, and numbers the rest within 40 characters', () => {
        expect(getNumberedExploreName('deals', 1)).toBe('deals');
        expect(getNumberedExploreName('deals', 2)).toBe('deals_2');
        expect(getNumberedExploreName('a'.repeat(40), 12)).toBe(
            `${'a'.repeat(37)}_12`,
        );
    });
});

describe('getLiveObjectModelName', () => {
    const free = () => false;

    it.each([
        ['Deals', 'deals'],
        ['Invoice__c', 'invoice__c'],
        ['p_123_deal-stage', 'p_123_deal_stage'],
        ['2024 Orders', 'orders'],
        ['___', 'object'],
        ['é', 'object'],
    ])('slugs %s as %s', (objectId, name) => {
        expect(getLiveObjectModelName(objectId, free)).toBe(name);
    });

    it('numbers past taken names', () => {
        const taken = new Set(['deals', 'deals_2']);
        expect(getLiveObjectModelName('Deals', (name) => taken.has(name))).toBe(
            'deals_3',
        );
    });

    it('cuts a long id to 40 characters, numbered too', () => {
        const id = 'x'.repeat(60);
        expect(getLiveObjectModelName(id, free)).toBe('x'.repeat(40));
        expect(
            getLiveObjectModelName(id, (name) => name === 'x'.repeat(40)),
        ).toBe(`${'x'.repeat(38)}_2`);
    });
});
