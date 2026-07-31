import { type ApiAppVersionSummary } from '@lightdash/common';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import { type DataAppVizBuildState } from '../hooks/useDataAppVizBuild';
import { useGetApp } from '../hooks/useGetApp';
import { useRestoreAppVersion } from '../hooks/useRestoreAppVersion';
import {
    appVersion,
    appVersionsPage,
    appVersionsUnreadable,
} from '../testing/appVersionHistory';
import { buildStub } from '../testing/dataAppVizBuildStub';
import DataAppVizVersionLog from './DataAppVizVersionLog';

vi.mock('../hooks/useGetApp', () => ({ useGetApp: vi.fn() }));
vi.mock('../hooks/useRestoreAppVersion', () => ({
    useRestoreAppVersion: vi.fn(),
}));

const mockedUseGetApp = vi.mocked(useGetApp);
const mockedUseRestore = vi.mocked(useRestoreAppVersion);
const restoreMutate = vi.fn();

const version = appVersion;

const setVersions = (
    versions: ApiAppVersionSummary[],
    latestReadyVersion?: number | null,
) => {
    mockedUseGetApp.mockReturnValue(
        appVersionsPage(versions, latestReadyVersion),
    );
};

const onCancelBuild = vi.fn();

const render = (build: DataAppVizBuildState = buildStub()) =>
    renderWithProviders(
        <DataAppVizVersionLog
            projectUuid="project-1"
            dataAppVizUuid="viz-1"
            build={build}
            elapsed={build.isBuilding ? '0:14' : null}
            onCancelBuild={onCancelBuild}
        />,
    );

describe('DataAppVizVersionLog', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockedUseRestore.mockReturnValue({
            mutate: restoreMutate,
            isLoading: false,
            error: null,
            reset: vi.fn(),
        } as unknown as ReturnType<typeof useRestoreAppVersion>);
    });

    it('reads newest first, one line per build', () => {
        setVersions([
            version(),
            version({ version: 2, prompt: 'make the bars horizontal' }),
        ]);
        render();

        const rows = screen.getAllByTestId(/version-log-row-/);
        expect(rows.map((row) => row.dataset.testid)).toEqual([
            'version-log-row-2',
            'version-log-row-1',
        ]);
        expect(
            screen.getByText('make the bars horizontal'),
        ).toBeInTheDocument();
    });

    it('receipts a finished build with its duration', () => {
        setVersions([version()]);
        render();

        expect(screen.getByText(/Built in 52s/)).toBeInTheDocument();
    });

    it('states why a build failed instead of receipting it', () => {
        setVersions([
            version({ status: 'error', error: 'The sandbox ran out of time' }),
        ]);
        render();

        expect(
            screen.getByText(/The sandbox ran out of time/),
        ).toBeInTheDocument();
    });

    it('marks the latest version as current and offers no restore for it', () => {
        setVersions([version(), version({ version: 2 })]);
        render();

        expect(screen.getByText('current')).toBeInTheDocument();
        expect(screen.getAllByRole('button', { name: 'Restore' })).toHaveLength(
            1,
        );
    });

    // "Current" is what the chart renders, which is the newest version that
    // finished. Reading it off the top of the log instead would crown a build
    // that failed and offer to restore the one already on screen.
    it('leaves current on the last good build when the newest one failed', () => {
        setVersions([version(), version({ version: 2, status: 'error' })]);
        render();

        expect(screen.getByTestId('version-log-row-1')).toHaveTextContent(
            'current',
        );
        expect(screen.getByTestId('version-log-row-2')).not.toHaveTextContent(
            'current',
        );
        // v1 is on screen, so restoring it would be a no-op that costs a build.
        expect(
            screen.queryByRole('button', { name: 'Restore' }),
        ).not.toBeInTheDocument();
    });

    it('leaves current on the last good build while a new one is running', () => {
        setVersions([version(), version({ version: 2, status: 'building' })]);
        render();

        expect(screen.getByTestId('version-log-row-1')).toHaveTextContent(
            'current',
        );
        expect(screen.getByTestId('version-log-row-2')).not.toHaveTextContent(
            'current',
        );
    });

    // The ready version can be older than the page window, and the server
    // resolves it across all versions. Crowning a row we happen to hold would
    // be a guess.
    it('crowns no row when the rendered version is older than the page', () => {
        setVersions(
            [
                version({ version: 9, status: 'error' }),
                version({ version: 8, status: 'error' }),
            ],
            4,
        );
        render();

        expect(screen.queryByText('current')).not.toBeInTheDocument();
    });

    it('does not offer to restore a build that failed', () => {
        setVersions([version({ status: 'error' }), version({ version: 2 })]);
        render();

        expect(
            screen.queryByRole('button', { name: 'Restore' }),
        ).not.toBeInTheDocument();
    });

    it('says so when the history cannot be read, rather than reading empty', () => {
        mockedUseGetApp.mockReturnValue(appVersionsUnreadable());
        render();

        expect(
            screen.getByText(/Could not load this visualization's versions/),
        ).toBeInTheDocument();
    });

    it('writes the request in flight as its own row, with the clock', () => {
        setVersions([version()]);
        render(
            buildStub({
                isBuilding: true,
                pendingPrompt: 'make the bars horizontal',
                claimedVersion: 2,
            }),
        );

        expect(
            screen.getByText('make the bars horizontal'),
        ).toBeInTheDocument();
        expect(screen.getByText('Building')).toBeInTheDocument();
        expect(screen.getByText('0:14')).toBeInTheDocument();
        expect(screen.getByText('v2')).toBeInTheDocument();
    });

    it('drops the live row once the version it claimed reaches history', () => {
        setVersions([version(), version({ version: 2 })]);
        render(
            buildStub({
                isBuilding: true,
                pendingPrompt: 'make the bars horizontal',
                claimedVersion: 2,
            }),
        );

        expect(screen.queryByText('Building')).not.toBeInTheDocument();
    });

    it('reports progress on any stage before a version lands', () => {
        setVersions([
            version(),
            version({
                version: 2,
                status: 'generating',
                statusUpdatedAt: null,
                prompt: 'make the bars horizontal',
            }),
        ]);
        render(
            buildStub({
                isBuilding: true,
                pendingPrompt: 'make the bars horizontal',
                claimedVersion: 2,
            }),
        );

        // One row, not a live row on top of the history row for the same build.
        expect(screen.getAllByText('make the bars horizontal')).toHaveLength(1);
        expect(screen.getByText('Building')).toBeInTheDocument();
        expect(screen.getByText('0:14')).toBeInTheDocument();
    });

    it('keeps the last finished version current while the next one builds', () => {
        setVersions([
            version(),
            version({
                version: 2,
                status: 'generating',
                statusUpdatedAt: null,
            }),
        ]);
        render(buildStub({ isBuilding: true, claimedVersion: 2 }));

        // v1 is what the chart still renders, so it is not restorable.
        expect(screen.getByText('current')).toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Restore' }),
        ).not.toBeInTheDocument();
    });

    it('stops only the build claimed by the local request', async () => {
        setVersions([
            version({ status: 'generating', statusUpdatedAt: null }),
            version({
                version: 2,
                status: 'generating',
                statusUpdatedAt: null,
            }),
        ]);
        render(buildStub({ isBuilding: true, claimedVersion: 2 }));

        const cancel = screen.getAllByRole('button', { name: 'Cancel' });
        expect(cancel).toHaveLength(1);
        expect(cancel[0]).toBeInTheDocument();
        expect(screen.getByTestId('version-log-row-2')).toContainElement(
            cancel[0],
        );
        await userEvent.click(cancel[0]);
        expect(onCancelBuild).toHaveBeenCalled();
    });

    it('offers to re-send a request the server never accepted', async () => {
        const retry = vi.fn();
        setVersions([version()]);
        render(buildStub({ error: 'The builder is busy', retry }));

        expect(screen.getByText('The builder is busy')).toBeInTheDocument();
        await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
        expect(retry).toHaveBeenCalled();
    });

    it('restores only once the consequence is confirmed', async () => {
        setVersions([version(), version({ version: 2 })]);
        render();

        await userEvent.click(screen.getByRole('button', { name: 'Restore' }));
        expect(restoreMutate).not.toHaveBeenCalled();
        expect(screen.getByRole('dialog')).toHaveTextContent(
            'All charts using this visualization will use the restored version. Selected fields unavailable in that version will be cleared.',
        );

        await userEvent.click(
            screen.getByRole('button', { name: 'Restore version' }),
        );
        expect(restoreMutate).toHaveBeenCalledWith(
            { projectUuid: 'project-1', appUuid: 'viz-1', version: 1 },
            expect.anything(),
        );
    });
});
