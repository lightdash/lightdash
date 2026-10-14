import {
    LightdashMode,
    type HealthState,
    type ReleaseHighlightsResult,
} from '@lightdash/common';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { renderWithProviders } from '../testing/testUtils';
import AboutFooter from './AboutFooter';
import {
    getChangesSinceVersionUrl,
    RELEASE_NOTES_URL,
    UPDATE_LIGHTDASH_DOCS_URL,
} from './upgradeNoticeLinks';

const mocks = vi.hoisted(() => ({
    ambientAiEnabled: vi.fn(() => true),
    highlightsHook: vi.fn(),
    query: {
        data: undefined as ReleaseHighlightsResult | undefined,
        isInitialLoading: false,
        isError: false,
    },
}));
vi.mock('../ee/features/ambientAi/hooks/useAmbientAiEnabled', () => ({
    useAmbientAiEnabled: mocks.ambientAiEnabled,
}));
vi.mock('../ee/features/releaseHighlights/useReleaseHighlights', () => ({
    useReleaseHighlights: mocks.highlightsHook,
}));

beforeEach(() => {
    mocks.ambientAiEnabled.mockReset().mockReturnValue(true);
    mocks.highlightsHook.mockReset().mockImplementation(() => mocks.query);
    mocks.query.data = undefined;
    mocks.query.isInitialLoading = false;
    mocks.query.isError = false;
});

const behindHealth: Partial<HealthState> = {
    mode: LightdashMode.DEFAULT,
    version: '2.500.0',
    latest: { version: '2.580.0' },
};
const renderFooter = (
    health: Partial<HealthState> = behindHealth,
    minimal = false,
) =>
    renderWithProviders(
        <MemoryRouter>
            <AboutFooter minimal={minimal} />
        </MemoryRouter>,
        { health },
    );
const openAboutModal = async () => {
    fireEvent.click(await screen.findByRole('button', { name: /v2\.500\.0/ }));
    return screen.findByRole('dialog');
};
const openWhatsNewDrawer = async () => {
    fireEvent.click(
        await screen.findByRole('button', {
            name: "New version available! Open what's new",
        }),
    );
    return screen.findByRole('dialog', { name: "What's new" });
};

describe.each([false, true])('AboutFooter (minimal=%s)', (minimal) => {
    it('places the original badge beside the version button and opens the drawer', async () => {
        renderFooter(behindHealth, minimal);
        const versionButton = await screen.findByRole('button', {
            name: /v2\.500\.0/,
        });
        const badge = screen.getByRole('button', {
            name: "New version available! Open what's new",
        });
        expect(badge).toHaveTextContent(/^New version available!$/);
        expect(badge).toHaveAttribute('type', 'button');
        expect(badge).toHaveAttribute('data-size', 'xs');
        expect(versionButton).not.toContainElement(badge);
        expect(versionButton.nextElementSibling).toBe(badge);
        expect(mocks.ambientAiEnabled).not.toHaveBeenCalled();
        expect(mocks.highlightsHook).not.toHaveBeenCalled();

        const dialog = await openWhatsNewDrawer();
        expect(
            screen.queryByRole('dialog', { name: 'About Lightdash' }),
        ).not.toBeInTheDocument();
        expect(
            within(dialog).getByRole('heading', {
                name: "What's new since v2.500.0",
                level: 4,
            }),
        ).toBeInTheDocument();
        const links = within(dialog).getAllByRole('link');
        expect(links.map((link) => link.textContent)).toEqual([
            'How to update (opens in a new tab)',
            'Changes since v2.500.0 (opens in a new tab)',
            'Release notes (opens in a new tab)',
            'Open full page (opens in a new tab)',
        ]);
        expect(links[0]).toHaveAttribute('href', UPDATE_LIGHTDASH_DOCS_URL);
        expect(links[1]).toHaveAttribute(
            'href',
            getChangesSinceVersionUrl('2.500.0', '2.580.0'),
        );
        expect(links[2]).toHaveAttribute('href', RELEASE_NOTES_URL);
        expect(links[3]).toHaveAttribute('href', '/whats-new');
        links.forEach((link) => {
            expect(link).toHaveAttribute('target', '_blank');
            expect(link).toHaveAttribute('rel', 'noreferrer');
            expect(within(link).getByText('(opens in a new tab)')).toHaveClass(
                'mantine-VisuallyHidden-root',
            );
            expect(link.querySelector('svg')).not.toBeNull();
        });
        expect(mocks.ambientAiEnabled).toHaveBeenCalled();
        expect(mocks.highlightsHook).toHaveBeenLastCalledWith({
            enabled: true,
        });
    });

    it('opens only instance details from the version button without calling AI hooks', async () => {
        renderFooter(behindHealth, minimal);
        const dialog = await openAboutModal();
        expect(dialog).toHaveAccessibleName('About Lightdash');
        expect(
            within(dialog).getByText('Instance details and licensing status.'),
        ).toBeInTheDocument();
        expect(within(dialog).getByText('v2.500.0')).toBeInTheDocument();
        expect(
            within(dialog).getByText('Enterprise license'),
        ).toBeInTheDocument();
        expect(
            within(dialog).getByRole('link', { name: 'Documentation' }),
        ).toHaveAttribute('href', 'https://docs.lightdash.com/');
        expect(
            within(dialog).getByRole('link', { name: 'GitHub' }),
        ).toHaveAttribute('href', 'https://github.com/lightdash/lightdash');
        expect(
            within(dialog).queryByText(
                /is available|Update available|New version available/,
            ),
        ).not.toBeInTheDocument();
        expect(
            within(dialog).queryByRole('link', {
                name: /How to update|Release notes|Changes since|See what's new/,
            }),
        ).not.toBeInTheDocument();
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        expect(mocks.ambientAiEnabled).not.toHaveBeenCalled();
        expect(mocks.highlightsHook).not.toHaveBeenCalled();
    });

    it.each([
        { ...behindHealth, latest: { version: '2.500.0' } },
        { ...behindHealth, mode: LightdashMode.CLOUD_BETA },
        { ...behindHealth, latest: { version: '' } },
    ])('omits the badge when no update applies: %j', async (health) => {
        renderFooter(health, minimal);
        const versionButton = await screen.findByRole('button', {
            name: /v2\.500\.0/,
        });
        expect(
            screen.queryByText('New version available!'),
        ).not.toBeInTheDocument();
        expect(versionButton.parentElement?.parentElement).toBe(
            screen.getByRole('contentinfo'),
        );
        await openAboutModal();
        expect(mocks.ambientAiEnabled).not.toHaveBeenCalled();
        expect(mocks.highlightsHook).not.toHaveBeenCalled();
    });

    it('keeps the update links and full page link when AI is disabled', async () => {
        mocks.ambientAiEnabled.mockReturnValue(false);
        renderFooter(behindHealth, minimal);
        const dialog = await openWhatsNewDrawer();
        expect(
            within(dialog).getByText(
                'Turn on AI to see a summary of new features here.',
            ),
        ).toBeInTheDocument();
        expect(within(dialog).getAllByRole('link')).toHaveLength(4);
        expect(mocks.highlightsHook).toHaveBeenLastCalledWith({
            enabled: false,
        });
    });

    it('unmounts the shared content after closing and can reopen the drawer', async () => {
        renderFooter(behindHealth, minimal);
        const dialog = await openWhatsNewDrawer();
        fireEvent.click(
            within(dialog).getByRole('button', { name: "Close what's new" }),
        );
        await waitFor(() =>
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
        );
        mocks.ambientAiEnabled.mockClear();
        mocks.highlightsHook.mockClear();
        await openAboutModal();
        expect(mocks.ambientAiEnabled).not.toHaveBeenCalled();
        expect(mocks.highlightsHook).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: 'Close' }));
        await waitFor(() =>
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
        );
        expect(await openWhatsNewDrawer()).toBeInTheDocument();
        expect(mocks.highlightsHook).toHaveBeenCalled();
    });
});

describe('getChangesSinceVersionUrl', () => {
    it('builds a compare URL between release tags', () => {
        expect(getChangesSinceVersionUrl('2.1.0', '2.3.4')).toBe(
            'https://github.com/lightdash/lightdash/compare/2.1.0...2.3.4',
        );
    });
});
