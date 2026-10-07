import {
    AiAccessRefusalAction,
    AiAccessRefusalReason,
    type AiAccessForUser,
} from '@lightdash/common';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement, type PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { aiAccessApi } from './api';
import { useAiAccessGate } from './useAiAccessGate';

const flag = vi.hoisted(() => ({ enabled: true, isLoading: false }));
vi.mock('../../providers/App/useApp', () => ({
    default: () => ({ user: { data: { organizationUuid: 'org-1' } } }),
}));
vi.mock('../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: () => ({
        data: flag.isLoading ? undefined : { enabled: flag.enabled },
        isLoading: flag.isLoading,
    }),
}));
vi.mock('../../hooks/toaster/useToaster', () => ({
    default: () => ({ showToastApiError: vi.fn() }),
}));
vi.mock('../../ee/providers/Embed/useUiStrings', () => ({
    useUiStrings: () => (key: string) => key,
}));

const refusal = {
    code: 'ai_access_refused' as const,
    reason: AiAccessRefusalReason.NEEDS_SIGN_IN,
    action: AiAccessRefusalAction.SIGN_IN,
    message: 'Sign in to run agent queries.',
    settingsUrl: null,
};
const accessResult = (refused: boolean) =>
    ({ refusal: refused ? refusal : null }) as AiAccessForUser;

const setup = (projectUuid?: string) => {
    const client = new QueryClient({
        defaultOptions: { queries: { retry: false, cacheTime: 0 } },
    });
    const wrapper = ({ children }: PropsWithChildren) =>
        createElement(QueryClientProvider, { client }, children);
    return {
        client,
        ...renderHook(
            ({ project }: { project?: string }) => useAiAccessGate(project),
            {
                wrapper,
                initialProps: { project: projectUuid },
            },
        ),
    };
};

describe('useAiAccessGate', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        localStorage.clear();
        flag.enabled = true;
        flag.isLoading = false;
    });

    it('renders while the flag loads and gates only when it becomes enabled', async () => {
        flag.isLoading = true;
        let resolveAccess!: (value: AiAccessForUser) => void;
        const me = vi.spyOn(aiAccessApi, 'me').mockReturnValue(
            new Promise((resolve) => {
                resolveAccess = resolve;
            }),
        );
        const { result, rerender } = setup('project-1');
        expect(result.current).toEqual({
            refusal: undefined,
            isLoading: false,
            isError: false,
            refetch: expect.any(Function),
            disabled: false,
        });
        expect(me).not.toHaveBeenCalled();
        flag.isLoading = false;
        rerender({ project: 'project-1' });
        expect(result.current.isLoading).toBe(true);
        await act(async () => resolveAccess(accessResult(true)));
        await waitFor(() =>
            expect(result.current).toEqual({
                refusal,
                isLoading: false,
                isError: false,
                refetch: expect.any(Function),
                disabled: true,
            }),
        );
    });

    it('disables the composer when the access query fails', async () => {
        vi.spyOn(aiAccessApi, 'me').mockRejectedValue({
            error: { message: 'Access check failed' },
        });
        const { result } = setup('project-1');
        await waitFor(() => expect(result.current.isError).toBe(true));
        expect(result.current.disabled).toBe(true);
        expect(result.current.isLoading).toBe(false);
        expect(result.current.refusal).toBeUndefined();
    });

    it('disables the composer when a previously successful check fails', async () => {
        const me = vi
            .spyOn(aiAccessApi, 'me')
            .mockResolvedValue(accessResult(false));
        const { result, client } = setup('project-1');
        await waitFor(() => expect(result.current.disabled).toBe(false));
        me.mockRejectedValue({ error: { message: 'Access check failed' } });
        await act(async () => {
            await client.invalidateQueries(['ai-access']);
        });
        await waitFor(() => expect(result.current.isError).toBe(true));
        expect(result.current.disabled).toBe(true);
    });

    it('ignores a cached error when the flag is turned off', async () => {
        vi.spyOn(aiAccessApi, 'me').mockRejectedValue({
            error: { message: 'Access check failed' },
        });
        const { result, rerender } = setup('project-1');
        await waitFor(() => expect(result.current.isError).toBe(true));
        flag.enabled = false;
        rerender({ project: 'project-1' });
        expect(result.current.isError).toBe(false);
        expect(result.current.disabled).toBe(false);
    });

    it.each(['off', 'unknown'])(
        'ignores a cached refusal when the flag is %s',
        async (state) => {
            vi.spyOn(aiAccessApi, 'me').mockResolvedValue(accessResult(true));
            const { result, rerender } = setup('project-1');
            await waitFor(() =>
                expect(result.current.refusal).toEqual(refusal),
            );
            flag.enabled = false;
            flag.isLoading = state === 'unknown';
            rerender({ project: 'project-1' });
            expect(result.current).toMatchObject({
                disabled: state === 'unknown',
                isLoading: state === 'unknown',
                isError: false,
                refusal: undefined,
            });
        },
    );

    it('recovers after the login popup invalidates ai-access', async () => {
        const me = vi
            .spyOn(aiAccessApi, 'me')
            .mockResolvedValue(accessResult(true));
        const { result, client } = setup('project-1');
        await waitFor(() => expect(result.current.refusal).toEqual(refusal));
        me.mockResolvedValue(accessResult(false));
        await act(async () => {
            await client.invalidateQueries(['ai-access']);
        });
        await waitFor(() =>
            expect(result.current).toEqual({
                refusal: null,
                isLoading: false,
                isError: false,
                refetch: expect.any(Function),
                disabled: false,
            }),
        );
        expect(me).toHaveBeenCalledTimes(2);
    });

    it.each([false, true])(
        'renders immediately without a project while flag loading is %s',
        (isLoading) => {
            flag.isLoading = isLoading;
            const me = vi.spyOn(aiAccessApi, 'me');
            const { result } = setup();
            expect(result.current).toEqual({
                refusal: undefined,
                isLoading: false,
                isError: false,
                refetch: expect.any(Function),
                disabled: false,
            });
            expect(me).not.toHaveBeenCalled();
        },
    );

    it('renders immediately with the flag off', () => {
        flag.enabled = false;
        const me = vi.spyOn(aiAccessApi, 'me');
        const { result } = setup('project-1');
        expect(result.current).toEqual({
            refusal: undefined,
            isLoading: false,
            isError: false,
            refetch: expect.any(Function),
            disabled: false,
        });
        expect(me).not.toHaveBeenCalled();
    });

    it('checks access when a project is selected or changed', async () => {
        const me = vi
            .spyOn(aiAccessApi, 'me')
            .mockResolvedValue(accessResult(false));
        const { result, rerender } = setup();
        rerender({ project: 'project-1' });
        expect(result.current.isLoading).toBe(true);
        await waitFor(() => expect(result.current.isLoading).toBe(false));
        expect(me).toHaveBeenLastCalledWith('project-1', null);
        rerender({ project: 'project-2' });
        expect(result.current.isLoading).toBe(true);
        await waitFor(() => expect(result.current.isLoading).toBe(false));
        expect(me).toHaveBeenLastCalledWith('project-2', null);
    });
});
