import { waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { sharedLightdashApi } from '../../../../api';
import { mockedLightdashApi } from '../../../../testing/mockedLightdashApi';
import { renderHookWithProviders } from '../../../../testing/testUtils';
import { useUploadAnnouncementImage } from './useAnnouncements';

vi.mock('../../../../api');

describe('useUploadAnnouncementImage', () => {
    it('POSTs the file body with its content-type header and returns the url', async () => {
        mockedLightdashApi.mockResolvedValue({
            url: 'https://x/file/abc',
        } as never);

        const { result } = renderHookWithProviders(() =>
            useUploadAnnouncementImage('project-1'),
        );

        const file = new File(['abc'], 'diagram.png', { type: 'image/png' });
        result.current.mutate(file);

        await waitFor(() => expect(result.current.isSuccess).toBe(true));

        expect(sharedLightdashApi).toHaveBeenCalledWith({
            url: '/projects/project-1/announcements/images',
            method: 'POST',
            headers: { 'Content-Type': 'image/png' },
            body: file,
        });
        expect(result.current.data).toEqual({ url: 'https://x/file/abc' });
    });
});
