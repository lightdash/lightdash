import { type ApiHomepageRecommendedActionSkipsResponse } from '@lightdash/common';
import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { type FC, type PropsWithChildren } from 'react';
import { lightdashApi } from '../../../../api';
import { createQueryClient } from '../../../../providers/ReactQuery/createQueryClient';
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

const queryKey = (projectUuid: string | null) => [
    'homepage-recommended-action-skips',
    projectUuid,
];

const renderWithQueryClient = (
    projectUuid: string | null,
    queryClient: ReturnType<typeof createQueryClient>,
) => {
    const Wrapper: FC<PropsWithChildren> = ({ children }) => (
        <QueryClientProvider client={queryClient}>
            {children}
        </QueryClientProvider>
    );

    return renderHook(
        () =>
            useHomepageRecommendedActionSkips(projectUuid, {
                enabled: false,
            }),
        { wrapper: Wrapper },
    );
};

describe('useHomepageRecommendedActionSkips', () => {
    beforeEach(() => {
        vi.mocked(lightdashApi).mockReset();
    });

    it('optimistically updates every cached context for organization actions', async () => {
        const queryClient = createQueryClient();
        queryClient.setQueryData(queryKey(null), []);
        queryClient.setQueryData(queryKey('project-uuid'), []);
        queryClient.setQueryData(queryKey('other-project-uuid'), [
            'add-semantic-layer',
        ]);
        const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
        const mutation = deferred<undefined>();
        vi.mocked(lightdashApi).mockReturnValueOnce(mutation.promise as never);

        const { result } = renderWithQueryClient('project-uuid', queryClient);

        act(() => result.current.skipAction('connect-slack'));

        await waitFor(() =>
            expect(result.current.skippedActions).toEqual(['connect-slack']),
        );
        expect(queryClient.getQueryData(queryKey(null))).toEqual([
            'connect-slack',
        ]);
        expect(
            queryClient.getQueryData(queryKey('other-project-uuid')),
        ).toEqual(['add-semantic-layer', 'connect-slack']);
        expect(lightdashApi).toHaveBeenCalledWith({
            url: '/ee/homepage/recommended-action-skips?projectUuid=project-uuid',
            method: 'POST',
            body: JSON.stringify({ actionKey: 'connect-slack' }),
        });

        act(() => mutation.resolve(undefined));
        await waitFor(() =>
            expect(invalidateQueries).toHaveBeenCalledWith({
                queryKey: ['homepage-recommended-action-skips'],
                exact: false,
            }),
        );
    });

    it('optimistically updates only the current context for project actions', async () => {
        const queryClient = createQueryClient();
        queryClient.setQueryData(queryKey(null), ['connect-slack']);
        queryClient.setQueryData(queryKey('project-uuid'), ['connect-slack']);
        queryClient.setQueryData(queryKey('other-project-uuid'), [
            'connect-slack',
        ]);
        const mutation = deferred<undefined>();
        vi.mocked(lightdashApi).mockReturnValueOnce(mutation.promise as never);

        const { result } = renderWithQueryClient('project-uuid', queryClient);

        act(() => result.current.skipAction('add-semantic-layer'));

        await waitFor(() =>
            expect(result.current.skippedActions).toEqual([
                'connect-slack',
                'add-semantic-layer',
            ]),
        );
        expect(queryClient.getQueryData(queryKey(null))).toEqual([
            'connect-slack',
        ]);
        expect(
            queryClient.getQueryData(queryKey('other-project-uuid')),
        ).toEqual(['connect-slack']);

        act(() => mutation.resolve(undefined));
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
