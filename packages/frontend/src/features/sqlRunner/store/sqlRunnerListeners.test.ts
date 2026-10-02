import { describe, expect, it, vi } from 'vitest';
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
        await effect(null, {
            getState: () => ({ sqlRunner: { projectUuid: 'other-project' } }),
        });
        expect(recordFailure).not.toHaveBeenCalled();
        await effect(null, {
            getState: () => ({ sqlRunner: { projectUuid: 'current-project' } }),
        });
        expect(recordFailure).toHaveBeenCalledOnce();
    });
});
