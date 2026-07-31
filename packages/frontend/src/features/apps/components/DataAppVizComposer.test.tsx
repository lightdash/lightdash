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
                }
            >(({ attachments, toolbarLeft }, ref) => {
                React.useImperativeHandle(ref, () => ({
                    getText: () => '',
                    clear: vi.fn(),
                }));

                return (
                    <div>
                        {attachments}
                        {toolbarLeft}
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
});
