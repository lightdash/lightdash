import { ContentAsCodeType } from '@lightdash/common';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockedLightdashApi } from '../../../testing/mockedLightdashApi';
import { renderWithProviders } from '../../../testing/testUtils';
import { type ImportEntry, type ImportResult } from '../importContent';
import ContentAsCodeUploadModal from './ContentAsCodeUploadModal';
import ProjectContentAsCodeUploadModal from './ProjectContentAsCodeUploadModal';

vi.mock('../../../api');

const spaceEntry = (slug: string): ImportEntry => ({
    id: slug,
    fileName: `${slug}.yml`,
    document: {
        type: 'space',
        content: {
            contentType: ContentAsCodeType.SPACE,
            spaceName: slug,
            slug,
        },
    },
    status: 'ready',
    message: null,
    warnings: [],
});

beforeEach(() => {
    mockedLightdashApi.mockReset();
});

describe('content-as-code upload integration', () => {
    it('waits for validation and explicit upload, then shows and retries backend errors', async () => {
        let fail = true;
        mockedLightdashApi.mockImplementation(({ method }) => {
            if (method === 'GET') return Promise.resolve({ openDraftCount: 1 });
            if (fail) {
                return Promise.reject({
                    status: 'error',
                    error: {
                        name: 'ForbiddenError',
                        statusCode: 403,
                        message: 'You cannot update this space.',
                        data: {},
                    },
                });
            }
            return Promise.resolve({ action: 'UPDATE' });
        });
        const onClose = vi.fn();
        renderWithProviders(
            <ProjectContentAsCodeUploadModal
                opened
                onClose={onClose}
                projectUuid="project"
                projectName="Sales"
            />,
        );
        const input = await screen.findByLabelText('Choose files to upload');
        expect(await screen.findByText(/1 open content draft/)).toBeVisible();
        const content = 'contentType: space\nspaceName: Sales\nslug: sales';
        const file = new File([content], 'sales.yml');
        Object.defineProperty(file, 'text', { value: async () => content });
        fireEvent.change(input, { target: { files: [file] } });
        const upload = await screen.findByRole('button', {
            name: 'Upload 1 file',
        });
        await waitFor(() => expect(upload).toBeEnabled());
        expect(
            mockedLightdashApi.mock.calls.every(
                ([args]) => args.method === 'GET',
            ),
        ).toBe(true);
        await userEvent.click(upload);
        expect(
            await screen.findByText('You cannot update this space.'),
        ).toBeVisible();
        fail = false;
        await userEvent.click(
            screen.getByRole('button', { name: 'Retry 1 file' }),
        );
        expect(
            await screen.findByText('Your content is ready in Sales.'),
        ).toBeVisible();
        expect(
            mockedLightdashApi.mock.calls.filter(
                ([args]) => args.method === 'POST',
            ),
        ).toHaveLength(2);
        await userEvent.click(screen.getByRole('button', { name: 'Done' }));
        expect(onClose).toHaveBeenCalledOnce();
    });

    it('stops scheduling the batch after the modal unmounts', async () => {
        let finish: (result: ImportResult) => void = () => {};
        const firstRequest = new Promise<ImportResult>((resolve) => {
            finish = resolve;
        });
        const upload = vi.fn().mockReturnValue(firstRequest);
        const { unmount } = renderWithProviders(
            <ContentAsCodeUploadModal
                opened
                onClose={vi.fn()}
                projectName="Sales"
                initialEntries={[spaceEntry('one'), spaceEntry('two')]}
                onUpload={upload}
            />,
        );
        await userEvent.click(
            await screen.findByRole('button', { name: 'Upload 2 files' }),
        );
        expect(upload).toHaveBeenCalledOnce();
        unmount();
        await act(async () => {
            finish({ message: 'Created', warnings: [] });
            await firstRequest;
        });
        expect(upload).toHaveBeenCalledOnce();
    });
});
