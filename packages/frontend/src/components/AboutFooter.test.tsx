import {
    LightdashMode,
    type HealthState,
    type ReleaseHighlightsResult,
} from '@lightdash/common';
import { fireEvent, screen } from '@testing-library/react';
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
const expectFallbackLinks = () => {
    expect(
        screen.getByRole('link', { name: 'How to update version' }),
    ).toBeInTheDocument();
    expect(
        screen.getByRole('link', { name: "See what's changed since v2.500.0" }),
    ).toBeInTheDocument();
    expect(
        screen.getByRole('link', { name: 'Release notes' }),
    ).toBeInTheDocument();
};

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

describe('AboutFooter release highlights', () => {
    it('requests highlights only once the modal with the update notice is open', async () => {
        renderFooter(behindHealth);
        expect(
            await screen.findByRole('button', { name: /v2\.500\.0/ }),
        ).toBeInTheDocument();
        expect(mocks.ambientAiEnabled).not.toHaveBeenCalled();
        expect(mocks.highlightsHook).not.toHaveBeenCalled();
        await openAboutModal();
        expect(mocks.highlightsHook).toHaveBeenLastCalledWith({
            enabled: true,
        });
    });

    it('shows a small loading state and keeps all fallback links', async () => {
        mocks.query.isInitialLoading = true;
        renderFooter(behindHealth);
        await openAboutModal();
        expect(
            await screen.findByText('Finding release highlights…'),
        ).toBeInTheDocument();
        expectFallbackLinks();
    });

    it('renders titles as links and benefits as plain text and keeps fallback links', async () => {
        mocks.query.data = {
            status: 'ready',
            fromVersion: '2.500.0',
            toVersion: '2.580.0',
            generatedAt: new Date(),
            highlights: [
                {
                    title: 'New chart options',
                    benefit: 'Create charts for more questions',
                    url: 'https://github.com/lightdash/lightdash/pull/31000',
                    version: '2.580.0',
                    requestedByYourOrganization: false,
                },
                {
                    title: 'Share charts',
                    benefit: '<b>Untrusted text</b>',
                    url: 'https://github.com/lightdash/lightdash/releases/tag/2.579.0',
                    version: '2.579.0',
                    requestedByYourOrganization: false,
                },
            ],
        };
        renderFooter(behindHealth);
        await openAboutModal();
        expect(
            await screen.findByText('Highlights since v2.500.0'),
        ).toBeInTheDocument();
        const link = screen.getByRole('link', { name: 'New chart options' });
        expect(link).toHaveAttribute(
            'href',
            'https://github.com/lightdash/lightdash/pull/31000',
        );
        expect(link).toHaveAttribute('target', '_blank');
        expect(link).toHaveAttribute('rel', 'noreferrer');
        expect(
            screen.getByRole('link', { name: 'Share charts' }),
        ).toHaveAttribute(
            'href',
            'https://github.com/lightdash/lightdash/releases/tag/2.579.0',
        );
        expect(
            screen.getByText('Create charts for more questions'),
        ).toBeInTheDocument();
        expect(
            screen.getByText('<b>Untrusted text</b>').querySelector('b'),
        ).toBeNull();
        expect(
            screen.getByText('AI-generated from release notes'),
        ).toBeInTheDocument();
        expect(
            screen.queryByText('You asked for this'),
        ).not.toBeInTheDocument();
        expectFallbackLinks();
    });

    it('shows the organization badge only for flagged items and caps the panel at five', async () => {
        mocks.query.data = {
            status: 'ready',
            fromVersion: '2.500.0',
            toVersion: '2.580.0',
            generatedAt: new Date(),
            highlights: Array.from({ length: 6 }, (_, index) => ({
                title: `Feature ${index}`,
                benefit: `Benefit ${index}`,
                url: `https://github.com/lightdash/lightdash/pull/${31000 + index}`,
                version: '2.580.0',
                requestedByYourOrganization: index === 2,
            })),
        };
        renderFooter(behindHealth);
        await openAboutModal();
        expect(
            await screen.findByText('Highlights since v2.500.0'),
        ).toBeInTheDocument();
        expect(screen.getAllByText('You asked for this')).toHaveLength(1);
        expect(
            screen.getByRole('link', { name: 'Feature 2' }).parentElement,
        ).toContainElement(screen.getByText('You asked for this'));
        expect(screen.getAllByRole('link', { name: /^Feature / })).toHaveLength(
            5,
        );
        expect(screen.queryByText('Feature 5')).not.toBeInTheDocument();
        expectFallbackLinks();
    });

    it('shows only the links when the highlights are unavailable', async () => {
        mocks.query.data = {
            status: 'unavailable',
            reason: 'source_unavailable',
        };
        renderFooter(behindHealth);
        await openAboutModal();
        expect(await screen.findByText('About Lightdash')).toBeInTheDocument();
        expect(
            screen.queryByText('Highlights since v2.500.0'),
        ).not.toBeInTheDocument();
        expectFallbackLinks();
    });

    it('shows only the links on a request error', async () => {
        mocks.query.isError = true;
        renderFooter(behindHealth);
        await openAboutModal();
        expect(await screen.findByText('About Lightdash')).toBeInTheDocument();
        expect(
            screen.queryByText('Highlights since v2.500.0'),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByText('Finding release highlights…'),
        ).not.toBeInTheDocument();
        expectFallbackLinks();
    });

    it('does not enable the hook or show loading when ambient AI is disabled', async () => {
        mocks.ambientAiEnabled.mockReturnValue(false);
        mocks.query.isInitialLoading = true;
        renderFooter(behindHealth);
        await openAboutModal();
        expect(mocks.highlightsHook).toHaveBeenLastCalledWith({
            enabled: false,
        });
        expect(
            screen.queryByText('Finding release highlights…'),
        ).not.toBeInTheDocument();
        expectFallbackLinks();
    });
});

describe('getChangesSinceVersionUrl', () => {
    it('builds a compare URL between release tags', () => {
        expect(getChangesSinceVersionUrl('2.1.0', '2.3.4')).toBe(
            'https://github.com/lightdash/lightdash/compare/2.1.0...2.3.4',
        );
    });
});
