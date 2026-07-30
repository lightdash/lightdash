import { type ApiHomepageRecommendedActionSkipsResponse } from '@lightdash/common';
import { act, waitFor } from '@testing-library/react';
import { lightdashApi } from '../../../../api';
import { renderHookWithProviders } from '../../../../testing/testUtils';
import { useHomepageRecommendedActionSkips } from './useHomepageRecommendedActionSkips';

vi.mock('../../../../api', () => ({
    lightdashApi: vi.fn(),
}));

const deferred = <T,>() => {
    let resolve: (value: T) => void = () => undefined;
    const promise = new Promise<T>((promiseResolve) => {
        resolve = promiseResolve;
    });
    return { promise, resolve };
};

describe('useHomepageRecommendedActionSkips', () => {
    beforeEach(() => {
        vi.mocked(lightdashApi).mockReset();
    });

    it('optimistically skips an action in a project-scoped query', async () => {
        const mutation = deferred<undefined>();
        vi.mocked(lightdashApi)
            .mockResolvedValueOnce(
                [] satisfies ApiHomepageRecommendedActionSkipsResponse['results'] as never,
            )
            .mockReturnValueOnce(mutation.promise as never)
            .mockResolvedValueOnce([
                'connect-slack',
            ] satisfies ApiHomepageRecommendedActionSkipsResponse['results'] as never);

        const { result } = renderHookWithProviders(() =>
            useHomepageRecommendedActionSkips('project-uuid', {
                enabled: true,
            }),
        );

        await waitFor(() => expect(result.current.skippedActions).toEqual([]));

        act(() => result.current.skipAction('connect-slack'));

        await waitFor(() =>
            expect(result.current.skippedActions).toEqual(['connect-slack']),
        );
        expect(lightdashApi).toHaveBeenNthCalledWith(2, {
            url: '/ee/homepage/recommended-action-skips?projectUuid=project-uuid',
            method: 'POST',
            body: JSON.stringify({ actionKey: 'connect-slack' }),
        });

        mutation.resolve(undefined);
    });

    it('loads the null-project context without a project sentinel', async () => {
        vi.mocked(lightdashApi).mockResolvedValueOnce([
            'connect-source-control',
        ] satisfies ApiHomepageRecommendedActionSkipsResponse['results'] as never);

        const { result } = renderHookWithProviders(() =>
            useHomepageRecommendedActionSkips(null, { enabled: true }),
        );

        await waitFor(() =>
            expect(result.current.skippedActions).toEqual([
                'connect-source-control',
            ]),
        );
        expect(lightdashApi).toHaveBeenCalledWith({
            url: '/ee/homepage/recommended-action-skips',
            method: 'GET',
            body: undefined,
        });
    });
});
