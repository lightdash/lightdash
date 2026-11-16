import { ApiConnectorType } from '../../types/querySources';
import {
    getDefaultExplorePrefix,
    getExplorePrefixError,
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
