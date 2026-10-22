import {
    getExpiredPersonalSignInMessage,
    PersonSignInProvider,
} from '@lightdash/common';
import { describe, expect, it, vi } from 'vitest';
import { getAsyncQueryError } from '../../queryRunner/asyncQueryError';
import { addAutomaticPivotFailureListener } from './sqlRunnerListeners';

const listen = vi.fn();

describe('automatic pivot retry tracking', () => {
    it('records a failed pivot for the current project', async () => {
        const recordFailure = vi.fn();
        addAutomaticPivotFailureListener(
            listen as never,
            'current-project',
            recordFailure,
        );
        const { effect } = listen.mock.calls[0][0];
        const action = {
            payload: getAsyncQueryError(
                getExpiredPersonalSignInMessage({
                    provider: PersonSignInProvider.GOOGLE,
                }),
            ).error,
        };
        await effect(action, {
            getState: () => ({ sqlRunner: { projectUuid: 'other-project' } }),
        });
        expect(recordFailure).not.toHaveBeenCalled();
        await effect(action, {
            getState: () => ({ sqlRunner: { projectUuid: 'current-project' } }),
        });
        expect(recordFailure).toHaveBeenCalledOnce();
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
