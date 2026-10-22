import {
    BIGQUERY_TOKEN_ERROR_MESSAGE_MARKER,
    getExpiredPersonalSignInMessage,
    getPreviewWarehouseSignInExpiredMessage,
    PersonSignInProvider,
} from '@lightdash/common';
import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { waitFor } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { queryBelongsToProject } from '../components/NavBar/sharedSignInListenerDecision';
import { getAsyncQueryError } from '../features/queryRunner/asyncQueryError';
import {
    captureSharedSignInQueryScope,
    clearSharedSignInQueryScope,
    replaySharedSignInQueries,
    startSharedSignInQueryScope,
    trackSharedSignInQuery,
    isWarehouseSignInQueryError,
} from './sharedSignInQueryRecovery';

test('replays all active warehouse query families and preserves metadata, disabled and other-project requests', async () => {
    startSharedSignInQueryScope('project_a', 'user_a');
    const client = new QueryClient({
        defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    const stop = client.getQueryCache().subscribe((event) => {
        if (event.type === 'updated' && event.action.type === 'fetch')
            trackSharedSignInQuery(event.query);
    });
    const cases = [
        { key: ['create-query', { projectUuid: 'project_a' }], retry: true },
        { key: ['dashboard_chart_ready_query', 'project_a'], retry: true },
        {
            key: [
                'savedSqlChartResults',
                'chart_a',
                { projectUuid: 'project_a' },
            ],
            retry: true,
        },
        { key: ['create-query', { projectUuid: 'project_b' }], retry: false },
        { key: ['tables', 'project_a'], retry: false },
        {
            key: [
                'savedSqlChartResults',
                'disabled',
                { projectUuid: 'project_a' },
            ],
            retry: false,
            enabled: false,
        },
    ].map((entry) => ({ ...entry, run: vi.fn(async () => ({})) }));
    const subscriptions = cases.map((entry) => {
        const observer = new QueryObserver(client, {
            queryKey: entry.key,
            queryFn: entry.run,
            enabled: entry.enabled,
        });
        return observer.subscribe(() => {});
    });
    await waitFor(() => expect(client.isFetching()).toBe(0));
    replaySharedSignInQueries(client, (query) =>
        queryBelongsToProject(query.queryKey, 'project_a'),
    );
    await waitFor(() => expect(client.isFetching()).toBe(0));
    for (const entry of cases)
        expect(entry.run).toHaveBeenCalledTimes(
            entry.enabled === false ? 0 : entry.retry ? 2 : 1,
        );
    subscriptions.forEach((unsubscribe) => unsubscribe());
    stop();
    client.clear();
    clearSharedSignInQueryScope(captureSharedSignInQueryScope('project_a')!);
});

test('keeps shared token, preview and Redshift classification and excludes misleading permission failures', () => {
    const rawSharedMessage = `${BIGQUERY_TOKEN_ERROR_MESSAGE_MARKER} (invalid_grant). Reconnect your BigQuery account in personal settings.`;
    expect(
        isWarehouseSignInQueryError(getAsyncQueryError(rawSharedMessage)),
    ).toBe(true);
    expect(
        getAsyncQueryError(
            getPreviewWarehouseSignInExpiredMessage('Upstream project'),
        ).error.name,
    ).toBe('PreviewWarehouseSignInExpiredError');
    expect(
        getAsyncQueryError('Redshift IAM credentials expired').error.name,
    ).toBe('RedshiftIamTokenError');
    for (const message of [
        rawSharedMessage,
        getExpiredPersonalSignInMessage({
            provider: PersonSignInProvider.GOOGLE,
        }),
        'Permission denied: invalid_grant Google token expired',
    ]) {
        expect(
            isWarehouseSignInQueryError({
                status: 'error',
                error: {
                    name: 'ForbiddenError',
                    statusCode: 403,
                    message,
                    data: {},
                },
            }),
        ).toBe(false);
    }
});
