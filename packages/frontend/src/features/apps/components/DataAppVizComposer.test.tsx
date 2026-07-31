import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import { useAppFileUpload } from '../hooks/useAppFileUpload';
import DataAppVizComposer from './DataAppVizComposer';

vi.mock('../hooks/useAppFileUpload', () => ({ useAppFileUpload: vi.fn() }));
vi.mock(
    '../../../components/common/PromptComposer/PromptComposer',
    async () => {
        const React = await import('react');

        return {
            default: React.forwardRef<
                { getText: () => string; clear: () => void },
                {
                    attachments?: React.ReactNode;
                    toolbarLeft?: React.ReactNode;
                    toolbarRight?: React.ReactNode;
                    onPaste?: React.ClipboardEventHandler<HTMLDivElement>;
                }
            >(({ attachments, toolbarLeft, toolbarRight, onPaste }, ref) => {
                React.useImperativeHandle(ref, () => ({
                    getText: () => '',
                    clear: vi.fn(),
                }));

                return (
                    <div data-testid="prompt-composer" onPaste={onPaste}>
                        {attachments}
                        {toolbarLeft}
                        {toolbarRight}
                    </div>
                );
            }),
        };
    },
);

describe('DataAppVizComposer', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(useAppFileUpload).mockReturnValue({
            mutateAsync: vi.fn().mockResolvedValue({ fileId: 'file-1' }),
        } as unknown as ReturnType<typeof useAppFileUpload>);
        URL.createObjectURL = vi.fn(() => 'blob:chart');
        URL.revokeObjectURL = vi.fn();
    });

    it('drops app-scoped attachments when the selected app changes', async () => {
        const props = {
            projectUuid: 'project-1',
            placeholder: 'Describe a visualization',
            isBuilding: false,
            onCancel: vi.fn(),
            onSubmit: vi.fn(),
        };
        const { container, rerender } = renderWithProviders(
            <DataAppVizComposer {...props} appUuid="app-1" />,
        );
        const input = container.querySelector('input[type="file"]');

        fireEvent.change(input!, {
            target: {
                files: [
                    new File(['image'], 'chart.png', { type: 'image/png' }),
                ],
            },
        });

        expect(await screen.findByAltText('Attached')).toBeInTheDocument();

        rerender(<DataAppVizComposer {...props} appUuid="app-2" />);

        expect(screen.queryByAltText('Attached')).not.toBeInTheDocument();
        expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:chart');
    });

    it('attaches an image pasted from the clipboard', async () => {
        const uploadFile = vi.fn().mockResolvedValue({ fileId: 'file-1' });
        vi.mocked(useAppFileUpload).mockReturnValue({
            mutateAsync: uploadFile,
        } as unknown as ReturnType<typeof useAppFileUpload>);
        renderWithProviders(
            <DataAppVizComposer
                projectUuid="project-1"
                appUuid="app-1"
                placeholder="Describe a visualization"
                isBuilding={false}
                onCancel={vi.fn()}
                onSubmit={vi.fn()}
            />,
        );
        const image = new File(['image'], 'pasted.png', {
            type: 'image/png',
        });

        fireEvent.paste(screen.getByTestId('prompt-composer'), {
            clipboardData: { files: [image] },
        });

        expect(await screen.findByAltText('Attached')).toBeInTheDocument();
        expect(uploadFile).toHaveBeenCalledWith({
            projectUuid: 'project-1',
            appUuid: 'app-1',
            file: image,
        });
    });

    it('attaches a file dropped on the composer', async () => {
        const uploadFile = vi.fn().mockResolvedValue({ fileId: 'file-1' });
        vi.mocked(useAppFileUpload).mockReturnValue({
            mutateAsync: uploadFile,
        } as unknown as ReturnType<typeof useAppFileUpload>);
        renderWithProviders(
            <DataAppVizComposer
                projectUuid="project-1"
                appUuid="app-1"
                placeholder="Describe a visualization"
                isBuilding={false}
                onCancel={vi.fn()}
                onSubmit={vi.fn()}
            />,
        );
        const file = new File(['image'], 'dropped.png', {
            type: 'image/png',
        });

        fireEvent.drop(screen.getByTestId('prompt-composer').parentElement!, {
            dataTransfer: { files: [file] },
        });

        expect(await screen.findByAltText('Attached')).toBeInTheDocument();
        expect(uploadFile).toHaveBeenCalledWith({
            projectUuid: 'project-1',
            appUuid: 'app-1',
            file,
        });
    });

    it('offers Stop generation while a build runs', () => {
        const onCancel = vi.fn();
        renderWithProviders(
            <DataAppVizComposer
                projectUuid="project-1"
                appUuid="app-1"
                placeholder="Describe a visualization"
                isBuilding
                onCancel={onCancel}
                onSubmit={vi.fn()}
            />,
        );

        fireEvent.click(
            screen.getByRole('button', { name: 'Stop generation' }),
        );

        expect(onCancel).toHaveBeenCalledOnce();
        expect(
            screen.queryByRole('button', { name: 'Send' }),
        ).not.toBeInTheDocument();
    });
});
