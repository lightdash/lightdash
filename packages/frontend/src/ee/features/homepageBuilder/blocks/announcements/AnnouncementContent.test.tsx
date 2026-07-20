import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../../../../testing/testUtils';
import { AnnouncementContent } from './AnnouncementContent';

describe('AnnouncementContent — image rendering', () => {
    it('renders an inline image and opens a lightbox on click', () => {
        renderWithProviders(
            <AnnouncementContent
                projectUuid="project-1"
                text="![before](https://x/file/abc)"
            />,
        );

        const inlineImage = screen.getByAltText('before');
        expect(inlineImage).toBeInTheDocument();

        fireEvent.click(inlineImage);

        // The lightbox renders a second <img> with the same src, inside the modal.
        const images = screen.getAllByRole('img', { name: 'before' });
        expect(images).toHaveLength(2);
    });
});
