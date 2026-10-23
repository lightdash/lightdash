import {
    BIGQUERY_TOKEN_ERROR_MESSAGE_MARKER,
    getExpiredPersonalSignInMessage,
    getPreviewWarehouseSignInExpiredMessage,
    PersonSignInProvider,
} from '@lightdash/common';
import { QueryClient } from '@tanstack/react-query';
import { expect, test, vi } from 'vitest';
import {
    WarehouseSignInPreflight,
    activateWarehouseSignInPreflight,
} from '../components/NavBar/warehouseSignInPreflight';
import { getAsyncQueryError } from '../features/queryRunner/asyncQueryError';
import {
    captureSharedSignInQueryScope,
    isCurrentSharedSignInQueryScope,
    canReplayRestoredSql,
    completeSharedSignInRestoration,
    isWarehouseSignInQueryError,
} from './sharedSignInQueryRecovery';

const status = {
    personalSelection: { warehouseConnectionUuid: null },
    provider: PersonSignInProvider.GOOGLE,
    subject: null,
    subjectBasis: null,
    expired: false,
    canReconnect: false,
    personalSignIn: {
        provider: PersonSignInProvider.GOOGLE,
        projectUuid: 'project_a',
        userWarehouseCredentialsUuid: 'credential_a',
        expired: true,
        canReconnect: true,
    },
};
const setup = () => {
    const store = new WarehouseSignInPreflight(
        {
            projectUuid: 'project_a',
            userUuid: 'user_a',
            pageGeneration: 'page_a',
        },
        true,
        false,
    );
    const stop = activateWarehouseSignInPreflight(store);
    const releaseSource = store.register('sql', null, 1);
    const check = store.checks.get('original')!;
    store.settle(null, check.generation, status);
    return { store, stop, releaseSource };
};
test('accepts one restoration, retires prior failures and preserves the matching imperative SQL identity', async () => {
    const { store, stop } = setup();
    const client = new QueryClient();
    const scope = captureSharedSignInQueryScope('project_a', null);
    const target = store.target!;
    expect(isCurrentSharedSignInQueryScope(scope)).toBe(true);
    const receipt = await completeSharedSignInRestoration(client, target);
    expect(receipt).not.toBeNull();
    expect(store.ready(null)).toBe(true);
    expect(store.target).toBeNull();
    expect(isCurrentSharedSignInQueryScope(scope)).toBe(false);
    expect(canReplayRestoredSql(scope, receipt)).toBe(true);
    expect(await completeSharedSignInRestoration(client, target)).toBeNull();
    expect(canReplayRestoredSql(scope, { ...receipt })).toBe(false);
    stop();
    client.clear();
});
test('status changes preserve a run identity but an authoritative selection return invalidates it', () => {
    const { store, stop, releaseSource } = setup();
    const scope = captureSharedSignInQueryScope('project_a', null);
    const check = store.checks.get('original')!;
    check.requestVersion += 1;
    store.dismiss(store.target!);
    expect(isCurrentSharedSignInQueryScope(scope)).toBe(true);
    releaseSource();
    const release = store.register('sql_other', 'connection_b', 1);
    expect(isCurrentSharedSignInQueryScope(scope)).toBe(false);
    release();
    store.register('sql_return', null, 1);
    expect(isCurrentSharedSignInQueryScope(scope)).toBe(false);
    expect(captureSharedSignInQueryScope('project_a')).toBeNull();
    stop();
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

test('an abandoned cancellation attempt preserves an eligible SQL failure for the next accepted repair', async () => {
    const { store, stop } = setup();
    const client = new QueryClient();
    const scope = captureSharedSignInQueryScope('project_a', null);
    const target = store.target!;
    const held = Promise.withResolvers<void>();
    const cancel = vi
        .spyOn(client, 'cancelQueries')
        .mockReturnValueOnce(held.promise);
    let current = true;
    const abandoned = completeSharedSignInRestoration(
        client,
        target,
        () => current,
    );
    current = false;
    store.dismiss(target);
    store.modalOpen = true;
    store.notify();
    held.resolve();
    expect(await abandoned).toBeNull();
    expect(store.target).toBe(target);
    const accepted = await completeSharedSignInRestoration(client, target);
    expect(accepted).not.toBeNull();
    expect(canReplayRestoredSql(scope, accepted)).toBe(true);
    expect(canReplayRestoredSql(scope, { ...accepted })).toBe(false);
    cancel.mockRestore();
    stop();
    client.clear();
});
