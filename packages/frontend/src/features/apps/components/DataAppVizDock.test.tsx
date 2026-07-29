import { type ApiAppVersionSummary } from '@lightdash/common';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import { useGetApp } from '../hooks/useGetApp';
import {
    appVersion,
    appVersionsPage,
    appVersionsUnreadable,
} from '../testing/appVersionHistory';
import DataAppVizDock from './DataAppVizDock';

vi.mock('../hooks/useGetApp', () => ({ useGetApp: vi.fn() }));
vi.mock('../hooks/useRestoreAppVersion', () => ({
    useRestoreAppVersion: () => ({
        mutate: vi.fn(),
        isLoading: false,
        error: null,
        reset: vi.fn(),
    }),
}));

const mockedUseGetApp = vi.mocked(useGetApp);

const version = appVersion;

const setVersions = (
    versions: ApiAppVersionSummary[],
    latestReadyVersion?: number | null,
) => {
    mockedUseGetApp.mockReturnValue(
        appVersionsPage(versions, latestReadyVersion),
    );
};

const render = () =>
    renderWithProviders(
        <DataAppVizDock projectUuid="project-1" dataAppVizUuid="viz-1" />,
    );

describe('DataAppVizDock', () => {
    beforeEach(() => vi.clearAllMocks());

    it('rests as provenance: who first asked, and how current it is', () => {
        setVersions([version(), version({ version: 2 })]);
        render();

        expect(screen.getByText(/Built by Katie Jones/)).toBeInTheDocument();
        expect(screen.getByText('v2')).toBeInTheDocument();
    });

    // The badge names what the chart is rendering. Reading it off the newest
    // version instead would claim a build that failed is on screen.
    it('badges the last good build, not a newer one that failed', () => {
        setVersions([version(), version({ version: 2, status: 'error' })]);
        render();

        expect(screen.getByText('v1')).toBeInTheDocument();
        expect(screen.queryByText('v2')).not.toBeInTheDocument();
    });

    it('badges the last good build while a newer one is running', () => {
        setVersions([version(), version({ version: 2, status: 'building' })]);
        render();

        expect(screen.getByText('v1')).toBeInTheDocument();
        expect(screen.queryByText('v2')).not.toBeInTheDocument();
    });

    it('badges the rendered version even when it is older than the page', () => {
        setVersions([version({ version: 9, status: 'error' })], 4);
        render();

        expect(screen.getByText('v4')).toBeInTheDocument();
    });

    it('shows no version badge before anything has built successfully', () => {
        setVersions([version({ status: 'building' })]);
        render();

        expect(screen.queryByText(/^v\d+$/)).not.toBeInTheDocument();
    });

    it('does not claim origin when earlier versions are still unloaded', () => {
        setVersions([version({ version: 7 })]);
        render();

        expect(
            screen.getByText(/Last updated by Katie Jones/),
        ).toBeInTheDocument();
    });

    it('reports the newest version once the history pages past the origin', () => {
        setVersions([
            version({
                version: 7,
                createdAt: new Date('2026-05-20T10:00:00Z'),
                createdByUser: {
                    userUuid: 'u2',
                    firstName: 'Ada',
                    lastName: 'Lovelace',
                },
            } as Partial<ApiAppVersionSummary>),
            version({ version: 3 }),
        ]);
        render();

        expect(
            screen.getByText(/Last updated by Ada Lovelace/),
        ).toBeInTheDocument();
        expect(
            screen.queryByText(/Last updated by Katie Jones/),
        ).not.toBeInTheDocument();
    });

    it('admits it when the history cannot be read', () => {
        mockedUseGetApp.mockReturnValue(appVersionsUnreadable());
        render();

        expect(screen.getByText('Versions unavailable')).toBeInTheDocument();
    });

    // Nothing built yet is not the same as nothing readable, and the composer
    // upstack replaces this bar with its own status line.
    it('stays quiet when the history is simply empty', () => {
        setVersions([]);
        render();

        expect(
            screen.queryByText('Versions unavailable'),
        ).not.toBeInTheDocument();
    });

    it('keeps the versions out of the way until they are asked for', () => {
        setVersions([version()]);
        render();

        expect(screen.queryByText('Versions')).not.toBeInTheDocument();
    });

    it('opens from the status line, not just the chevron', async () => {
        setVersions([version()]);
        render();

        await userEvent.click(screen.getByText(/Built by Katie Jones/));

        expect(screen.getByText('Versions')).toBeInTheDocument();
        expect(
            screen.getByText('a donut of orders by status'),
        ).toBeInTheDocument();
    });

    it('offers the full builder as the way out', async () => {
        setVersions([version()]);
        render();

        await userEvent.click(
            screen.getByRole('button', { name: 'Show versions' }),
        );

        expect(
            screen.getByRole('link', { name: /Open in builder/ }),
        ).toHaveAttribute('href', '/projects/project-1/apps/viz-1');
    });

    // The dock is a shell: what else belongs against the panel's bottom edge
    // is the caller's business, so these are slots rather than branches here.
    it('takes over the resting line when the caller supplies a status', () => {
        setVersions([version()]);
        renderWithProviders(
            <DataAppVizDock
                projectUuid="project-1"
                dataAppVizUuid="viz-1"
                status={<span>Building v2</span>}
            />,
        );

        expect(screen.getByText('Building v2')).toBeInTheDocument();
        expect(
            screen.queryByText(/Built by Katie Jones/),
        ).not.toBeInTheDocument();
    });

    // Resting, the dock is one line of provenance. The footer belongs to the
    // versions it sits under, so it comes and goes with them.
    it('holds the footer back until the versions are open', async () => {
        setVersions([version()]);
        renderWithProviders(
            <DataAppVizDock
                projectUuid="project-1"
                dataAppVizUuid="viz-1"
                footer={<span>footer slot</span>}
            />,
        );

        expect(screen.queryByText('footer slot')).not.toBeInTheDocument();

        await userEvent.click(
            screen.getByRole('button', { name: 'Show versions' }),
        );

        expect(screen.getByText('footer slot')).toBeInTheDocument();

        await userEvent.click(
            screen.getByRole('button', { name: 'Hide versions' }),
        );

        expect(screen.queryByText('footer slot')).not.toBeInTheDocument();
    });

    it('closes back down to the bar', async () => {
        setVersions([version()]);
        render();

        await userEvent.click(
            screen.getByRole('button', { name: 'Show versions' }),
        );
        await userEvent.click(
            screen.getByRole('button', { name: 'Hide versions' }),
        );

        expect(screen.queryByText('Versions')).not.toBeInTheDocument();
        expect(screen.getByText(/Built by Katie Jones/)).toBeInTheDocument();
    });
});
