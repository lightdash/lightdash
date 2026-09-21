import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../../../testing/testUtils';
import { DataAppBuildCard } from './DataAppBuildCard';

const noop = () => undefined;

/** jsdom lays nothing out, so overflow has to be faked to test the clamp. */
const mockSummaryOverflow = () => {
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(400);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(100);
};

afterEach(() => {
    vi.restoreAllMocks();
});

describe('DataAppBuildCard', () => {
    it('ready: names the theme the version was built with', () => {
        renderWithProviders(
            <DataAppBuildCard
                state={{
                    kind: 'ready',
                    name: 'Revenue app',
                    version: 2,
                    durationMs: 90_000,
                    themeName: 'Brand',
                    restoredFromVersion: null,
                    completionMessage: 'Version 2 is ready!',
                }}
                compact={false}
                isActive={false}
                onView={noop}
            />,
        );
        expect(
            screen.getByText('v2 · built in 1m 30s · Brand theme'),
        ).toBeVisible();
    });

    it('queued: explains the wait and offers no action', () => {
        renderWithProviders(
            <DataAppBuildCard
                state={{ kind: 'queued', name: null }}
                compact={false}
                isActive={false}
                onView={noop}
            />,
        );
        expect(screen.getByText('Building data app')).toBeVisible();
        expect(
            screen.getByText(
                'Starting the build. This can take a few minutes.',
            ),
        ).toBeVisible();
        expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });

    it('queued: shows the name the agent supplied', () => {
        renderWithProviders(
            <DataAppBuildCard
                state={{ kind: 'queued', name: 'Revenue Overview' }}
                compact={false}
                isActive={false}
                onView={noop}
            />,
        );
        expect(screen.getByText('Revenue Overview')).toBeVisible();
    });

    it('building: shows the live status message and narration rows', () => {
        renderWithProviders(
            <DataAppBuildCard
                state={{
                    kind: 'building',
                    name: null,
                    statusMessage: 'Building your app',
                    narration: {
                        reasoning: ['Totals should reconcile against revenue'],
                        activity: ['Ran 5 queries'],
                    },
                }}
                compact={false}
                isActive={false}
                onView={noop}
            />,
        );
        expect(screen.getByText('Building data app')).toBeVisible();
        expect(screen.getByText('Building your app')).toBeVisible();
        expect(screen.getByText('Reasoning')).toBeVisible();
        expect(screen.getByText('Activity')).toBeVisible();
        expect(
            screen.getByText(
                "Builds in the background, so it's safe to close the tab.",
            ),
        ).toBeVisible();
        expect(
            screen.queryByText('Continue in builder'),
        ).not.toBeInTheDocument();
    });

    it('ready: names the app, version, duration; View is the only action', async () => {
        const onView = vi.fn();
        renderWithProviders(
            <DataAppBuildCard
                state={{
                    kind: 'ready',
                    name: 'Weekly revenue by region',
                    version: 1,
                    durationMs: 372_000,
                    themeName: null,
                    restoredFromVersion: null,
                    completionMessage: 'Your app is ready.',
                }}
                compact={false}
                isActive={false}
                onView={onView}
            />,
        );
        expect(screen.getByText('Weekly revenue by region')).toBeVisible();
        expect(screen.getByText('v1 · built in 6m 12s')).toBeVisible();
        expect(screen.getByText('Your app is ready.')).toBeVisible();
        await userEvent.click(screen.getByRole('button', { name: 'View' }));
        expect(onView).toHaveBeenCalledTimes(1);
        expect(screen.getAllByRole('button')).toHaveLength(1);
        expect(
            screen.queryByText('Continue in builder'),
        ).not.toBeInTheDocument();
    });

    it('ready: omits the duration when unknown', () => {
        renderWithProviders(
            <DataAppBuildCard
                state={{
                    kind: 'ready',
                    name: 'Weekly revenue by region',
                    version: 3,
                    durationMs: null,
                    themeName: null,
                    restoredFromVersion: null,
                    completionMessage: 'Done.',
                }}
                compact={false}
                isActive={false}
                onView={noop}
            />,
        );
        expect(screen.getByText('v3')).toBeVisible();
    });

    it('ready: a restored version says where it came from instead of a duration', () => {
        renderWithProviders(
            <DataAppBuildCard
                state={{
                    kind: 'ready',
                    name: 'Weekly revenue by region',
                    version: 3,
                    durationMs: null,
                    themeName: null,
                    restoredFromVersion: 1,
                    completionMessage: 'Restored version 1 as version 3.',
                }}
                compact={false}
                isActive={false}
                onView={noop}
            />,
        );
        expect(screen.getByText('v3 · restored from v1')).toBeVisible();
        expect(
            screen.getByText('Restored version 1 as version 3.'),
        ).toBeVisible();
        expect(screen.getByRole('button', { name: 'View' })).toBeVisible();
    });

    it('ready: renders the summary as markdown', () => {
        renderWithProviders(
            <DataAppBuildCard
                state={{
                    kind: 'ready',
                    name: 'Weekly revenue by region',
                    version: 1,
                    durationMs: 372_000,
                    themeName: null,
                    restoredFromVersion: null,
                    completionMessage:
                        'Built **five pages** from `src/App.jsx`.',
                }}
                compact={false}
                isActive={false}
                onView={noop}
            />,
        );
        expect(screen.getByText('five pages')).toHaveAttribute(
            'data-streamdown',
            'strong',
        );
        expect(screen.getByText('src/App.jsx')).toHaveAttribute(
            'data-streamdown',
            'inline-code',
        );
    });

    it('ready: a long summary stays clamped until See more is clicked', async () => {
        mockSummaryOverflow();
        renderWithProviders(
            <DataAppBuildCard
                state={{
                    kind: 'ready',
                    name: 'Weekly revenue by region',
                    version: 1,
                    durationMs: 372_000,
                    themeName: null,
                    restoredFromVersion: null,
                    completionMessage: 'A very long summary. '.repeat(50),
                }}
                compact={false}
                isActive={false}
                onView={noop}
            />,
        );
        await userEvent.click(
            await screen.findByRole('button', { name: 'See more' }),
        );
        expect(screen.getByRole('button', { name: 'See less' })).toBeVisible();
    });

    it('ready: a short summary has no See more button', () => {
        renderWithProviders(
            <DataAppBuildCard
                state={{
                    kind: 'ready',
                    name: 'Weekly revenue by region',
                    version: 1,
                    durationMs: 372_000,
                    themeName: null,
                    restoredFromVersion: null,
                    completionMessage: 'Your app is ready.',
                }}
                compact={false}
                isActive={false}
                onView={noop}
            />,
        );
        expect(
            screen.queryByRole('button', { name: 'See more' }),
        ).not.toBeInTheDocument();
    });

    it('failed: shows the builder failure message and no action', () => {
        renderWithProviders(
            <DataAppBuildCard
                state={{
                    kind: 'failed',
                    message: 'Build failed while generating.',
                }}
                compact={false}
                isActive={false}
                onView={noop}
            />,
        );
        expect(screen.getByText("The app couldn't be built")).toBeVisible();
        expect(
            screen.getByText('Build failed while generating.'),
        ).toBeVisible();
        expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });

    it('cancelled: one row with no action', () => {
        renderWithProviders(
            <DataAppBuildCard
                state={{ kind: 'cancelled' }}
                compact={false}
                isActive={false}
                onView={noop}
            />,
        );
        expect(screen.getByText('Build cancelled')).toBeVisible();
        expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });

    it('unavailable: no actions at all', () => {
        renderWithProviders(
            <DataAppBuildCard
                state={{ kind: 'unavailable' }}
                compact={false}
                isActive={false}
                onView={noop}
            />,
        );
        expect(
            screen.getByText('This app is no longer available.'),
        ).toBeVisible();
        expect(screen.queryAllByRole('button')).toHaveLength(0);
    });

    it('compact ready: collapses to one row but keeps View', () => {
        renderWithProviders(
            <DataAppBuildCard
                state={{
                    kind: 'ready',
                    name: 'Weekly revenue by region',
                    version: 1,
                    durationMs: 372_000,
                    themeName: null,
                    restoredFromVersion: null,
                    completionMessage: 'Your app is ready.',
                }}
                compact
                isActive={false}
                onView={noop}
            />,
        );
        expect(screen.getByText('Weekly revenue by region')).toBeVisible();
        expect(screen.getByText('v1 · built in 6m 12s')).toBeVisible();
        expect(
            screen.queryByText('Your app is ready.'),
        ).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'View' })).toBeVisible();
        expect(screen.getAllByRole('button')).toHaveLength(1);
    });

    it('compact failed: one row joining title and message', () => {
        renderWithProviders(
            <DataAppBuildCard
                state={{
                    kind: 'failed',
                    message: 'Build failed while generating.',
                }}
                compact
                isActive={false}
                onView={noop}
            />,
        );
        expect(
            screen.getByText(
                "The app couldn't be built. Build failed while generating.",
            ),
        ).toBeVisible();
        expect(screen.queryAllByRole('button')).toHaveLength(0);
    });
});
