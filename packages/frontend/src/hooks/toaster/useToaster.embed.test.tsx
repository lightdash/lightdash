import { notifications } from '@mantine/notifications';
import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LightdashEventType } from '../../ee/features/embed/events/types';
import useToaster from './useToaster';

const mocks = vi.hoisted(() => ({
    mode: 'sdk' as 'sdk' | 'direct',
    dispatchEmbedEvent: vi.fn(),
}));
vi.mock('../../ee/providers/Embed/useEmbed', () => ({
    default: () => ({
        mode: mocks.mode,
        dispatchEmbedEvent: mocks.dispatchEmbedEvent,
    }),
}));

describe('useToaster in embeds', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        mocks.dispatchEmbedEvent.mockClear();
    });

    it('sends SDK toasts to the host as notification events', () => {
        mocks.mode = 'sdk';
        const show = vi.spyOn(notifications, 'show');
        const { result } = renderHook(() => useToaster());

        result.current.showToastSuccess({
            key: 'chart-saved',
            title: 'Success! Chart was saved.',
            subtitle: 'Saved to **Space**',
        });
        result.current.showToastApiError({
            key: 'save-failed',
            apiError: {
                name: 'ForbiddenError',
                statusCode: 403,
                message: 'You do not have access',
                data: {},
            },
        });

        expect(show).not.toHaveBeenCalled();
        expect(mocks.dispatchEmbedEvent).toHaveBeenNthCalledWith(
            1,
            LightdashEventType.Notification,
            {
                id: 'chart-saved',
                variant: 'success',
                title: 'Success! Chart was saved.',
                message: 'Saved to **Space**',
            },
        );
        expect(mocks.dispatchEmbedEvent).toHaveBeenNthCalledWith(
            2,
            LightdashEventType.Notification,
            {
                id: 'save-failed',
                variant: 'error',
                title: 'Error',
                message: 'You do not have access',
            },
        );
    });

    it('keeps rendering toasts in direct embeds', () => {
        mocks.mode = 'direct';
        const show = vi.spyOn(notifications, 'show');
        const { result } = renderHook(() => useToaster());

        result.current.showToastInfo({ title: 'Exporting' });

        expect(show).toHaveBeenCalledTimes(1);
        expect(mocks.dispatchEmbedEvent).not.toHaveBeenCalled();
    });
});
