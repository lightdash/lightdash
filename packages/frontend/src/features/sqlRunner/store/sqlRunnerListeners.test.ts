import {
    getExpiredPersonalSignInMessage,
    PersonSignInProvider,
} from '@lightdash/common';
import { describe, expect, it, vi } from 'vitest';
import {
    WarehouseSignInPreflight,
    activateWarehouseSignInPreflight,
} from '../../../components/NavBar/warehouseSignInPreflight';
import {
    captureSharedSignInQueryScope,
    rememberSharedSignInFailure,
} from '../../../hooks/sharedSignInQueryRecovery';
import { getAsyncQueryError } from '../../queryRunner/asyncQueryError';
import { addAutomaticPivotFailureListener } from './sqlRunnerListeners';

const listen = vi.fn();

describe('automatic pivot retry tracking', () => {
    it('records a failed pivot for the current project', async () => {
        const preflight = new WarehouseSignInPreflight(
            {
                projectUuid: 'current-project',
                userUuid: 'user_a',
                pageGeneration: 'page_a',
            },
            true,
            false,
        );
        const stop = activateWarehouseSignInPreflight(preflight);
        preflight.register('sql', null, 1);
        const recordFailure = vi.fn();
        addAutomaticPivotFailureListener(
            listen as never,
            'current-project',
            recordFailure,
        );
        const { effect } = listen.mock.calls[0][0];
        const action = {
            meta: { requestId: 'request_a' },
            payload: getAsyncQueryError(
                getExpiredPersonalSignInMessage({
                    provider: PersonSignInProvider.GOOGLE,
                }),
            ).error,
        };
        rememberSharedSignInFailure(
            action.payload,
            captureSharedSignInQueryScope('current-project', null),
        );
        await effect(action, {
            getState: () => ({ sqlRunner: { projectUuid: 'other-project' } }),
        });
        expect(recordFailure).not.toHaveBeenCalled();
        await effect(action, {
            getState: () => ({
                sqlRunner: {
                    projectUuid: 'current-project',
                    pivotRequestId: 'request_a',
                },
            }),
        });
        expect(recordFailure).toHaveBeenCalledOnce();
        stop();
    });
});

it('does not record an unrelated automatic pivot permission failure', async () => {
    listen.mockClear();
    const recordFailure = vi.fn();
    addAutomaticPivotFailureListener(
        listen as never,
        'project_a',
        recordFailure,
    );
    const { effect } = listen.mock.calls[0][0];
    await effect(
        {
            payload: {
                name: 'ForbiddenError',
                statusCode: 403,
                message: 'invalid_grant Google token expired',
                data: {},
            },
        },
        { getState: () => ({ sqlRunner: { projectUuid: 'project_a' } }) },
    );
    expect(recordFailure).not.toHaveBeenCalled();
});
