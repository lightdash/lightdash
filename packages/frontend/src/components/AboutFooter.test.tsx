import { LightdashMode, type HealthState } from '@lightdash/common';
import { fireEvent, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { renderWithProviders } from '../testing/testUtils';
import AboutFooter from './AboutFooter';
import {
    getChangesSinceVersionUrl,
    RELEASE_NOTES_URL,
    UPDATE_LIGHTDASH_DOCS_URL,
} from './upgradeNoticeLinks';

const renderFooter = (health: Partial<HealthState>) =>
    renderWithProviders(
        <MemoryRouter>
            <AboutFooter />
        </MemoryRouter>,
        { health },
    );

const openAboutModal = async () => {
    fireEvent.click(await screen.findByRole('button', { name: /v2\.500\.0/ }));
};

describe('AboutFooter upgrade notice', () => {
    it('links to the update docs, the changes since the running version and the release notes', async () => {
        renderFooter({
            mode: LightdashMode.DEFAULT,
            version: '2.500.0',
            latest: { version: '2.580.0' },
        });

        await openAboutModal();

        expect(
            await screen.findByRole('link', { name: 'How to update version' }),
        ).toHaveAttribute('href', UPDATE_LIGHTDASH_DOCS_URL);
        expect(
            screen.getByRole('link', {
                name: "See what's changed since v2.500.0",
            }),
        ).toHaveAttribute(
            'href',
            'https://github.com/lightdash/lightdash/compare/2.500.0...2.580.0',
        );
        expect(
            screen.getByRole('link', { name: 'Release notes' }),
        ).toHaveAttribute('href', RELEASE_NOTES_URL);
    });

    it('does not show the upgrade notice on the latest version', async () => {
        renderFooter({
            mode: LightdashMode.DEFAULT,
            version: '2.500.0',
            latest: { version: '2.500.0' },
        });

        await openAboutModal();

        expect(await screen.findByText('About Lightdash')).toBeInTheDocument();
        expect(
            screen.queryByRole('link', { name: 'Release notes' }),
        ).not.toBeInTheDocument();
    });

    it('does not show the upgrade notice on cloud', async () => {
        renderFooter({
            mode: LightdashMode.CLOUD_BETA,
            version: '2.500.0',
            latest: { version: '2.580.0' },
        });

        await openAboutModal();

        expect(await screen.findByText('About Lightdash')).toBeInTheDocument();
        expect(
            screen.queryByText('New version available!'),
        ).not.toBeInTheDocument();
    });
});

describe('getChangesSinceVersionUrl', () => {
    it('builds a compare URL between release tags', () => {
        expect(getChangesSinceVersionUrl('2.1.0', '2.3.4')).toBe(
            'https://github.com/lightdash/lightdash/compare/2.1.0...2.3.4',
        );
    });
});
