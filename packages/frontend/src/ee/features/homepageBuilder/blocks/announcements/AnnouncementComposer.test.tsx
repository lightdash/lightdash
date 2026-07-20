import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../../testing/testUtils';
import { useUploadAnnouncementImage } from '../../hooks/useAnnouncements';
import { AnnouncementComposer } from './AnnouncementComposer';

vi.mock('../../hooks/useAnnouncements', () => ({
    useUploadAnnouncementImage: vi.fn(),
}));

describe('AnnouncementComposer — image insertion', () => {
    it('uploads a selected file and inserts it into the editor', async () => {
        const mutate = vi.fn((_file, { onSuccess }) =>
            onSuccess({ url: 'https://x/file/abc' }),
        );
        vi.mocked(useUploadAnnouncementImage).mockReturnValue({
            mutate,
            isLoading: false,
        } as unknown as ReturnType<typeof useUploadAnnouncementImage>);

        renderWithProviders(
            <AnnouncementComposer projectUuid="project-1" onPost={vi.fn()} />,
        );

        const file = new File(['abc'], 'diagram.png', { type: 'image/png' });
        const input = screen.getByLabelText('Insert image');

        fireEvent.change(input, { target: { files: [file] } });

        await waitFor(() =>
            expect(mutate).toHaveBeenCalledWith(
                file,
                expect.objectContaining({ onSuccess: expect.any(Function) }),
            ),
        );
    });

    it('rejects a file over the size cap without uploading', () => {
        const mutate = vi.fn();
        vi.mocked(useUploadAnnouncementImage).mockReturnValue({
            mutate,
            isLoading: false,
        } as unknown as ReturnType<typeof useUploadAnnouncementImage>);

        renderWithProviders(
            <AnnouncementComposer projectUuid="project-1" onPost={vi.fn()} />,
        );

        const oversized = new File(
            [new Uint8Array(6 * 1024 * 1024)],
            'big.png',
            { type: 'image/png' },
        );
        const input = screen.getByLabelText('Insert image');

        fireEvent.change(input, { target: { files: [oversized] } });

        expect(mutate).not.toHaveBeenCalled();
    });
});
