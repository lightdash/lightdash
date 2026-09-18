import { ResourceViewItemType } from '@lightdash/common';
import { MantineProvider } from '@mantine/core';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { PersonalFavoritesBar } from './FavoritesBlock';

const toggleFavorite = vi.hoisted(() => vi.fn());
vi.mock('../../../../hooks/favorites/useFavorites', () => ({
    useFavorites: () => ({
        data: [
            {
                type: ResourceViewItemType.DOCUMENT,
                data: {
                    uuid: 'document',
                    name: 'Weekly report',
                    slug: 'weekly-report',
                },
            },
        ],
    }),
}));
vi.mock('../../../../hooks/favorites/useFavoriteMutation', () => ({
    useFavoriteMutation: () => ({ mutate: toggleFavorite }),
}));
vi.mock('../../../../hooks/useProjectRoute', () => ({
    useProjectUrlIdentifier: () => 'project-slug',
}));

describe('Document favorites on the homepage', () => {
    it('links to the canonical Document slug and allows removal', () => {
        render(
            <MantineProvider env="test">
                <MemoryRouter>
                    <PersonalFavoritesBar projectUuid="project" />
                </MemoryRouter>
            </MantineProvider>,
        );
        expect(
            screen.getByRole('link', { name: /Weekly report/ }),
        ).toHaveAttribute(
            'href',
            '/projects/project-slug/documents/weekly-report',
        );
        fireEvent.click(
            screen.getByLabelText('Remove Weekly report from favorites'),
        );
        expect(toggleFavorite).toHaveBeenCalledWith({
            contentType: 'document',
            contentUuid: 'document',
        });
    });
});
