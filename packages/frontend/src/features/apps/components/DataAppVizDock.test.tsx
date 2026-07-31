import { type ApiAppVersionSummary } from '@lightdash/common';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import { useAppBuildPoller } from '../hooks/useAppBuildPoller';
import { type DataAppVizBuildState } from '../hooks/useDataAppVizBuild';
import { useGetApp } from '../hooks/useGetApp';
import {
    appVersion,
    appVersionsPage,
    appVersionsUnreadable,
} from '../testing/appVersionHistory';
import { buildStub } from '../testing/dataAppVizBuildStub';
import DataAppVizDock from './DataAppVizDock';

vi.mock('../hooks/useGetApp', () => ({ useGetApp: vi.fn() }));
vi.mock('../hooks/useAppBuildPoller', () => ({ useAppBuildPoller: vi.fn() }));
vi.mock('../hooks/useRestoreAppVersion', () => ({
    useRestoreAppVersion: () => ({
        mutate: vi.fn(),
        isLoading: false,
        error: null,
        reset: vi.fn(),
    }),
}));

const mockedUseGetApp = vi.mocked(useGetApp);
const mockedUseAppBuildPoller = vi.mocked(useAppBuildPoller);

const version = appVersion;

const setVersions = (
    versions: ApiAppVersionSummary[],
    latestReadyVersion?: number | null,
) => {
    mockedUseGetApp.mockReturnValue(
        appVersionsPage(versions, latestReadyVersion),
    );
};

// The panel hands the composer down as the footer, so these tests stand in for
// it the same way: what the dock owes is a place to put it under its versions.
const composerSlot = <button type="button">Send</button>;

const render = (
    dataAppVizUuid: string | null = 'viz-1',
    build: DataAppVizBuildState = buildStub(),
    footer: ReactNode = dataAppVizUuid === null ? composerSlot : null,
) =>
    renderWithProviders(
        <DataAppVizDock
            projectUuid="project-1"
            dataAppVizUuid={dataAppVizUuid}
            build={build}
            elapsed={build.isBuilding ? '0:14' : null}
            footer={footer}
        />,
    );

describe('DataAppVizDock', () => {
    beforeEach(() => vi.clearAllMocks());

    it('rests as provenance: who first asked, and how current it is', () => {
        setVersions([version(), version({ version: 2 })]);
        render();

        expect(screen.getByText(/Built by Katie Jones/)).toBeInTheDocument();
        expect(screen.getByText('v2')).toBeInTheDocument();
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

    it('is the footer alone before a visualization exists', () => {
        setVersions([]);
        render(null);

        expect(
            screen.getByRole('button', { name: 'Send' }),
        ).toBeInTheDocument();
        // Nothing to collapse yet, so no version chrome to collapse it with.
        expect(screen.queryByText('Versions')).not.toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Show versions' }),
        ).not.toBeInTheDocument();
    });

    it('shows a failed create before a visualization exists', async () => {
        const retry = vi.fn();
        setVersions([]);
        render(
            null,
            buildStub({
                error: 'The sandbox ran out of memory',
                retry,
            }),
        );

        expect(
            screen.getByText('The sandbox ran out of memory'),
        ).toBeInTheDocument();
        await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
        expect(retry).toHaveBeenCalledOnce();
    });

    it('keeps a first build bare — the build, then the footer', () => {
        setVersions([version({ status: 'generating', statusUpdatedAt: null })]);
        // The panel resolves the draft's app before handing it down.
        render(
            'draft-app',
            buildStub({
                isBuilding: true,
                appUuid: 'draft-app',
                claimedVersion: 1,
                pendingPrompt: 'a donut of orders by status',
            }),
            composerSlot,
        );

        expect(screen.getByText('Building')).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Send' }),
        ).toBeInTheDocument();
        // Nothing has landed, so there is no version chrome to wrap it in.
        expect(screen.queryByText('Versions')).not.toBeInTheDocument();
        expect(
            screen.queryByRole('link', { name: /Open in builder/ }),
        ).not.toBeInTheDocument();
    });

    it('leaves the footer out when the panel supplies none', async () => {
        setVersions([version()]);
        render();

        await userEvent.click(
            screen.getByRole('button', { name: 'Show versions' }),
        );

        expect(
            screen.queryByRole('button', { name: 'Send' }),
        ).not.toBeInTheDocument();
    });

    it('rides a build in flight on the dock’s top edge', () => {
        setVersions([version()]);
        render('viz-1', buildStub({ isBuilding: true, claimedVersion: 2 }));

        expect(
            screen.getByRole('progressbar', { name: 'Build in progress' }),
        ).toHaveAttribute('aria-valuetext', '0:14');
    });

    it('polls a build that started outside the chart config', () => {
        setVersions([
            version(),
            version({
                version: 2,
                status: 'generating',
                statusUpdatedAt: null,
            }),
        ]);
        render();

        expect(mockedUseAppBuildPoller).toHaveBeenLastCalledWith(
            'project-1',
            'viz-1',
            true,
            expect.any(Function),
        );
    });

    it('does not add a second poller for a locally owned build', () => {
        setVersions([
            version(),
            version({
                version: 2,
                status: 'generating',
                statusUpdatedAt: null,
            }),
        ]);
        render(
            'viz-1',
            buildStub({
                isBuilding: true,
                appUuid: 'viz-1',
                claimedVersion: 2,
            }),
        );

        expect(mockedUseAppBuildPoller).toHaveBeenLastCalledWith(
            'project-1',
            'viz-1',
            false,
            expect.any(Function),
        );
    });

    // The badge names what the chart is rendering. Reading it off the newest
    // version instead would claim a build that failed is on screen.
    it('badges the last good build, not a newer one that failed', () => {
        setVersions([version(), version({ version: 2, status: 'error' })]);
        render();

        expect(screen.getByText('v1')).toBeInTheDocument();
        expect(screen.queryByText('v2')).not.toBeInTheDocument();
    });

    it('badges the rendered version even when it is older than the page', () => {
        setVersions(
            [version({ version: 9, status: 'error' }), version({ version: 5 })],
            4,
        );
        render();

        expect(screen.getByText('v4')).toBeInTheDocument();
    });

    it('takes over the resting line when the panel supplies a status', () => {
        setVersions([version()]);
        renderWithProviders(
            <DataAppVizDock
                projectUuid="project-1"
                dataAppVizUuid="viz-1"
                build={buildStub()}
                elapsed={null}
                status={<span>Restoring…</span>}
            />,
        );

        expect(screen.getByText('Restoring…')).toBeInTheDocument();
        expect(
            screen.queryByText(/Built by Katie Jones/),
        ).not.toBeInTheDocument();
    });

    // Resting, the dock is one line of provenance. The composer belongs to the
    // versions it sits under, so it comes and goes with them.
    it('holds the footer back until the versions are open', async () => {
        setVersions([version()]);
        render('viz-1', buildStub(), composerSlot);

        expect(
            screen.queryByRole('button', { name: 'Send' }),
        ).not.toBeInTheDocument();

        await userEvent.click(
            screen.getByRole('button', { name: 'Show versions' }),
        );

        expect(
            screen.getByRole('button', { name: 'Send' }),
        ).toBeInTheDocument();

        await userEvent.click(
            screen.getByRole('button', { name: 'Hide versions' }),
        );

        expect(
            screen.queryByRole('button', { name: 'Send' }),
        ).not.toBeInTheDocument();
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
        expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    });
});
