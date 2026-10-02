import { expect, test, vi } from 'vitest';
import { SHARED_SIGN_IN_QUERY_FAILED } from '../../hooks/useReconnectSharedSignIn';
import { BaseResultsRunner } from './BaseResultsRunner';

test('reports a failed visualization run with its project', async () => {
    const listener = vi.fn();
    const error = new Error('expired');
    window.addEventListener(SHARED_SIGN_IN_QUERY_FAILED, listener);
    const runner = new BaseResultsRunner({
        fields: [],
        rows: [],
        columnNames: [],
        projectUuid: 'project-a',
        runPivotQuery: vi.fn().mockRejectedValue(error),
    });

    await expect(runner.getPivotedVisualizationData({} as never)).rejects.toBe(
        error,
    );
    expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
            detail: { projectUuid: 'project-a', error },
        }),
    );
    window.removeEventListener(SHARED_SIGN_IN_QUERY_FAILED, listener);
});
