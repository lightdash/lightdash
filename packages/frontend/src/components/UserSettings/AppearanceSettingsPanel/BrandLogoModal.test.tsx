import { MantineProvider } from '@mantine/core';
import {
    act,
    cleanup,
    fireEvent,
    render,
    screen,
    waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadImageSize } from '../../../hooks/organization/brandLogos';
import { BrandLogoModal } from './BrandLogoModal';

const upload = vi.hoisted(() => ({ mutate: vi.fn(), reset: vi.fn() }));
vi.mock('../../../hooks/organization/useOrganizationBrand', () => ({
    useUploadOrganizationBrandLogo: () => ({
        ...upload,
        isLoading: false,
        isError: false,
    }),
}));
vi.mock('../../../hooks/organization/brandLogos', () => ({
    loadImageSize: vi.fn(),
}));

const renderModal = () => {
    const onApply = vi.fn();
    const onClose = vi.fn();
    render(
        <MantineProvider env="test">
            <BrandLogoModal logo={null} onApply={onApply} onClose={onClose} />
        </MantineProvider>,
    );
    return { onApply, onClose };
};

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(loadImageSize).mockResolvedValue({ width: 64, height: 64 });
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:logo-preview');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
});
afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

describe('organization logo selection', () => {
    it('previews a dropped file without uploading until confirmed', async () => {
        const { onApply, onClose } = renderModal();
        const file = new File(['image'], 'logo.png', { type: 'image/png' });
        fireEvent.drop(screen.getByText('Drop an image here'), {
            dataTransfer: { files: [file] },
        });
        expect(
            await screen.findByAltText('Selected logo preview'),
        ).toHaveAttribute('src', 'blob:logo-preview');
        expect(upload.mutate).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: 'Use image' }));
        expect(upload.mutate).toHaveBeenCalledWith(
            file,
            expect.objectContaining({ onSuccess: expect.any(Function) }),
        );
        expect(onApply).not.toHaveBeenCalled();
        await act(() =>
            upload.mutate.mock.calls[0][1].onSuccess({
                url: '/api/v1/org/brand/logos/upload',
                format: 'png',
            }),
        );
        expect(onApply).toHaveBeenCalledWith(
            '/api/v1/org/brand/logos/upload',
            'png',
        );
        expect(onClose).toHaveBeenCalledOnce();
    });

    it('discards a picked file on cancel and releases its preview', async () => {
        const { onApply, onClose } = renderModal();
        fireEvent.change(screen.getByLabelText('Choose image to upload'), {
            target: {
                files: [new File(['image'], 'logo.png', { type: 'image/png' })],
            },
        });
        await screen.findByAltText('Selected logo preview');
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        expect(onClose).toHaveBeenCalledOnce();
        expect(onApply).not.toHaveBeenCalled();
        expect(upload.mutate).not.toHaveBeenCalled();
        cleanup();
        expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:logo-preview');
    });

    it('rejects a non-square URL and ignores stale validation results', async () => {
        let resolveFirst: (size: {
            width: number;
            height: number;
        }) => void = () => {};
        vi.mocked(loadImageSize).mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    resolveFirst = resolve;
                }),
        );
        vi.mocked(loadImageSize).mockResolvedValueOnce({
            width: 100,
            height: 40,
        });
        const { onApply } = renderModal();
        const input = screen.getByRole('textbox', { name: 'Image URL' });
        fireEvent.change(input, {
            target: { value: 'https://example.com/first.png' },
        });
        fireEvent.change(input, {
            target: { value: 'https://example.com/wide.png' },
        });
        await screen.findByText('Use an image with equal width and height');
        await act(async () => resolveFirst({ width: 64, height: 64 }));
        expect(
            screen.getByRole('button', { name: 'Use image' }),
        ).toBeDisabled();
        expect(onApply).not.toHaveBeenCalled();
    });

    it('applies a validated image URL without uploading a file', async () => {
        const { onApply, onClose } = renderModal();
        fireEvent.change(screen.getByRole('textbox', { name: 'Image URL' }), {
            target: { value: 'https://example.com/logo.jpg' },
        });
        await waitFor(() =>
            expect(
                screen.getByRole('button', { name: 'Use image' }),
            ).toBeEnabled(),
        );
        fireEvent.click(screen.getByRole('button', { name: 'Use image' }));
        expect(onApply).toHaveBeenCalledWith(
            'https://example.com/logo.jpg',
            'jpeg',
        );
        expect(onClose).toHaveBeenCalledOnce();
        expect(upload.mutate).not.toHaveBeenCalled();
    });
});
