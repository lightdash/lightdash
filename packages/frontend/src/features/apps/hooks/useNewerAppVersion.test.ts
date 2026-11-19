import { type ApiError } from '@lightdash/common';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useNewerAppVersion } from './useNewerAppVersion';

const apiError = (data: Record<string, unknown>): ApiError => ({
    status: 'error',
    error: { name: 'ForbiddenError', statusCode: 403, message: 'no', data },
});
const NEWER_VERSION_ERROR = apiError({ code: 'data_app_newer_version' });

type Props = {
    appUuid?: string;
    version: number | undefined;
    tokenError: ApiError | null;
};

const render = (initialProps: Props) => {
    const refetchApp = vi.fn();
    const hook = renderHook(
        (props: Props) =>
            useNewerAppVersion({ appUuid: 'app-a', ...props, refetchApp }),
        { initialProps },
    );
    return { ...hook, refetchApp };
};

describe('useNewerAppVersion', () => {
    it('stays quiet until a newer version is reported', () => {
        const { result, refetchApp } = render({ version: 2, tokenError: null });
        expect(result.current.isOutdated).toBe(false);
        expect(refetchApp).not.toHaveBeenCalled();
    });

    it('refetches the app once when a query reports a newer version', () => {
        const { result, refetchApp } = render({ version: 2, tokenError: null });
        act(() => result.current.onNewerVersion());
        act(() => result.current.onNewerVersion());
        expect(refetchApp).toHaveBeenCalledTimes(1);
        expect(result.current.isOutdated).toBe(true);
    });

    it('clears once the host moves on to the newer version', () => {
        const { result, rerender } = render({ version: 2, tokenError: null });
        act(() => result.current.onNewerVersion());
        rerender({ version: 3, tokenError: null });
        expect(result.current.isOutdated).toBe(false);
    });

    it('refetches again if the newer version is itself replaced', () => {
        const { result, rerender, refetchApp } = render({
            version: 2,
            tokenError: null,
        });
        act(() => result.current.onNewerVersion());
        rerender({ version: 3, tokenError: null });
        act(() => result.current.onNewerVersion());
        expect(refetchApp).toHaveBeenCalledTimes(2);
    });

    it('does not carry over to another app on the same version number', () => {
        const { result, rerender, refetchApp } = render({
            version: 1,
            tokenError: null,
        });
        act(() => result.current.onNewerVersion());
        rerender({ appUuid: 'app-b', version: 1, tokenError: null });
        expect(result.current.isOutdated).toBe(false);
        act(() => result.current.onNewerVersion());
        expect(refetchApp).toHaveBeenCalledTimes(2);
    });

    it('treats a refused token refresh the same way', () => {
        const { result, refetchApp } = render({
            version: 2,
            tokenError: NEWER_VERSION_ERROR,
        });
        expect(refetchApp).toHaveBeenCalledTimes(1);
        expect(result.current.isOutdated).toBe(true);
    });

    it('ignores other token errors', () => {
        const { result, refetchApp } = render({
            version: 2,
            tokenError: apiError({}),
        });
        expect(refetchApp).not.toHaveBeenCalled();
        expect(result.current.isOutdated).toBe(false);
    });
});
