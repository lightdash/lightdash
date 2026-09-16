import { Ability } from '@casl/ability';
import {
    ContentType,
    type DeletedDocumentContentSummary,
    type PossibleAbilities,
} from '@lightdash/common';
import { MantineProvider } from '@mantine/core';
import { fireEvent, render, screen } from '@testing-library/react';
import DeletedContentActionMenu from './DeletedContentActionMenu';

const ability = new Ability<PossibleAbilities>([]);
vi.mock('../../../providers/App/useApp', () => ({
    default: () => ({ user: { data: { ability } } }),
}));
const item: DeletedDocumentContentSummary = {
    uuid: 'document',
    name: 'Weekly review',
    description: null,
    contentType: ContentType.DOCUMENT,
    deletedAt: new Date(),
    deletedBy: null,
    spaceUuid: 'space',
    spaceName: 'Private',
    projectUuid: 'project',
    organizationUuid: 'org',
};
const renderMenu = () => {
    const onRestore = vi.fn();
    const onPermanentlyDelete = vi.fn();
    render(
        <MantineProvider env="test">
            <DeletedContentActionMenu
                item={item}
                onRestore={onRestore}
                onPermanentlyDelete={onPermanentlyDelete}
            />
        </MantineProvider>,
    );
    fireEvent.click(
        screen.getByRole('button', { name: 'Actions for Weekly review' }),
    );
    return { onRestore, onPermanentlyDelete };
};
describe('Deleted Document actions', () => {
    it('restores without requiring Document management', async () => {
        ability.update([]);
        const { onRestore } = renderMenu();
        fireEvent.click(
            await screen.findByRole('menuitem', { name: 'Restore' }),
        );
        expect(onRestore).toHaveBeenCalledOnce();
        expect(
            screen.queryByRole('menuitem', { name: 'Delete permanently' }),
        ).not.toBeInTheDocument();
    });
    it('requires confirmation before permanent deletion with tenant management', async () => {
        ability.update([
            {
                action: 'manage',
                subject: 'Document',
                conditions: { organizationUuid: 'org', projectUuid: 'project' },
            },
        ]);
        const { onPermanentlyDelete } = renderMenu();
        fireEvent.click(
            await screen.findByRole('menuitem', { name: 'Delete permanently' }),
        );
        expect(onPermanentlyDelete).not.toHaveBeenCalled();
        fireEvent.click(
            await screen.findByRole('button', { name: 'Delete permanently' }),
        );
        expect(onPermanentlyDelete).toHaveBeenCalledOnce();
    });
    it.each([
        { organizationUuid: 'other', projectUuid: 'project' },
        { organizationUuid: 'org', projectUuid: 'other' },
        {
            organizationUuid: 'org',
            projectUuid: 'project',
            inheritsFromOrgOrProject: true,
        },
    ])(
        'does not treat mismatched or conditional Space rights as tenant management %j',
        async (conditions) => {
            ability.update([
                { action: 'manage', subject: 'Document', conditions },
            ]);
            renderMenu();
            expect(
                await screen.findByRole('menuitem', { name: 'Restore' }),
            ).toBeInTheDocument();
            expect(
                screen.queryByRole('menuitem', { name: 'Delete permanently' }),
            ).not.toBeInTheDocument();
        },
    );
});
