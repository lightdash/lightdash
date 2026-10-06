import { type Document } from '@lightdash/common';
import { MantineProvider } from '@mantine/core';
import { fireEvent, render, screen } from '@testing-library/react';
import SaveDocumentToSpaceButton from './SaveDocumentToSpaceButton';

const mocks = vi.hoisted(() => ({ canEdit: true, modal: vi.fn() }));
vi.mock('./useCanEditDocument', () => ({
    useCanEditDocument: () => mocks.canEdit,
}));
vi.mock('./SaveDocumentToSpaceModal', () => ({
    default: (props: unknown) => {
        mocks.modal(props);
        return <div>Save to a space form</div>;
    },
}));

const personal = {
    documentUuid: 'document',
    projectUuid: 'project',
    spaceUuid: null,
} as unknown as Document;

const renderButton = (document: Document) =>
    render(
        <MantineProvider>
            <SaveDocumentToSpaceButton document={document} />
        </MantineProvider>,
    );

describe('SaveDocumentToSpaceButton', () => {
    beforeEach(() => {
        mocks.canEdit = true;
        mocks.modal.mockReset();
    });

    it('opens the save form for a personal Document its editor can save', async () => {
        renderButton(personal);
        fireEvent.click(screen.getByRole('button', { name: 'Save to space' }));
        expect(await screen.findByText('Save to a space form')).toBeVisible();
        expect(mocks.modal).toHaveBeenCalledWith(
            expect.objectContaining({ document: personal }),
        );
    });

    it('is hidden from readers', () => {
        mocks.canEdit = false;
        renderButton(personal);
        expect(
            screen.queryByRole('button', { name: 'Save to space' }),
        ).not.toBeInTheDocument();
    });

    it('is hidden once the Document is in a space', () => {
        renderButton({ ...personal, spaceUuid: 'space' });
        expect(
            screen.queryByRole('button', { name: 'Save to space' }),
        ).not.toBeInTheDocument();
    });
});
