import {
    ApiConnectorType,
    type ExternalConnectionListItem,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    createLiveSourceMatcher,
    integrationOfLiveExploreName,
} from './liveSourceExplores';

const connection = (
    uuid: string,
    liveSourceName: string | null,
    connector: ApiConnectorType,
): ExternalConnectionListItem =>
    ({
        externalConnectionUuid: uuid,
        liveSourceName,
        apiSource: { connector },
    }) as unknown as ExternalConnectionListItem;

describe('createLiveSourceMatcher', () => {
    const sourceOf = createLiveSourceMatcher([
        connection('c-1', 'posthog', ApiConnectorType.POSTHOG),
        connection('c-2', 'posthog_2', ApiConnectorType.POSTHOG),
        connection('c-3', 'marketing', ApiConnectorType.GA4),
    ]);

    it('matches the longest source name', () => {
        expect(sourceOf('posthog_events')?.externalConnectionUuid).toBe('c-1');
        expect(sourceOf('posthog_2_events')?.externalConnectionUuid).toBe(
            'c-2',
        );
    });

    it('matches a renamed source', () => {
        expect(sourceOf('marketing_report')?.apiSource?.connector).toBe(
            ApiConnectorType.GA4,
        );
    });

    it('matches nothing for another explore', () => {
        expect(sourceOf('orders')).toBeUndefined();
    });
});

describe('integrationOfLiveExploreName', () => {
    it('reads the integration from a default source name', () => {
        expect(integrationOfLiveExploreName('posthog_events')).toBe(
            ApiConnectorType.POSTHOG,
        );
        expect(integrationOfLiveExploreName('google_analytics_report')).toBe(
            ApiConnectorType.GA4,
        );
        expect(integrationOfLiveExploreName('search_console_performance')).toBe(
            ApiConnectorType.SEARCH_CONSOLE,
        );
    });

    it('is unknown for a renamed source', () => {
        expect(
            integrationOfLiveExploreName('marketing_report'),
        ).toBeUndefined();
    });
});
