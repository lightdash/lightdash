import { type Document } from '@lightdash/common';
import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import DocumentByline from './DocumentByline';

vi.mock('../../components/Avatar', () => ({
    LightdashUserAvatar: () => null,
}));
vi.mock('../../components/common/PageHeader/UpdatedInfo', () => ({
    UpdatedInfo: () => <span>Last edited</span>,
}));

const document = {
    updatedAt: new Date('2026-09-15'),
    createdBy: {
        userUuid: 'creator',
        firstName: 'Grace',
        lastName: 'Hopper',
        avatarUrl: null,
        avatarGradient: null,
    },
    owner: null,
} as unknown as Document;

const renderByline = (owner: Document['owner']) =>
    render(
        <MantineProvider>
            <DocumentByline document={{ ...document, owner }} />
        </MantineProvider>,
    );

describe('DocumentByline', () => {
    it('shows the assigned owner beside the unchanged creator', () => {
        renderByline({
            userUuid: 'owner',
            firstName: 'Ada',
            lastName: 'Lovelace',
            email: 'ada@example.com',
        });
        expect(screen.getByText('Grace Hopper')).toBeVisible();
        expect(screen.getByText('Owned by Ada Lovelace')).toBeVisible();
    });

    it('falls back to the owner email when the name is empty', () => {
        renderByline({
            userUuid: 'owner',
            firstName: '',
            lastName: '',
            email: 'ada@example.com',
        });
        expect(screen.getByText('Owned by ada@example.com')).toBeVisible();
    });

    it('marks a personal Document', () => {
        render(
            <MantineProvider>
                <DocumentByline document={{ ...document, spaceUuid: null }} />
            </MantineProvider>,
        );
        expect(screen.getByText('Personal')).toBeVisible();
    });

    it('omits the personal mark for a Document in a Space', () => {
        render(
            <MantineProvider>
                <DocumentByline
                    document={{ ...document, spaceUuid: 'space' }}
                />
            </MantineProvider>,
        );
        expect(screen.queryByText('Personal')).not.toBeInTheDocument();
    });

    it('omits ownership for an unowned Document', () => {
        renderByline(null);
        expect(screen.queryByText(/Owned by/)).not.toBeInTheDocument();
    });
});
