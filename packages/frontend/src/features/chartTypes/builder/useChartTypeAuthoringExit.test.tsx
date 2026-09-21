import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type FC } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import { type DataAppVizDraft } from '../hooks/useDataAppVizBuild';
import BuildInProgressExitModal from './BuildInProgressExitModal';
import { useChartTypeAuthoringExit } from './useChartTypeAuthoringExit';

const { deleteApp } = vi.hoisted(() => ({ deleteApp: vi.fn() }));
vi.mock('../../apps/hooks/useDeleteApp', () => ({
    useDeleteApp: () => ({ mutate: deleteApp }),
}));

const draft: DataAppVizDraft = {
    appUuid: 'viz-new',
    version: 1,
    startedAt: new Date('2026-08-19T00:00:00Z'),
};

type HarnessProps = {
    dataAppVizUuid: string | null;
    createdInSession: boolean;
    isBuilding: boolean;
    draft: DataAppVizDraft | null;
    discard: (() => void) | null;
    latestReadyVersion: number | null;
    isHistoryLoading: boolean;
    isLatestVersionInProgress: boolean;
    onExit: () => void;
};

// `performExit` is declared fresh on every render, so an accept click always
// runs the current one — never one captured from an earlier render.
const Harness: FC<HarnessProps> = ({ onExit, ...args }) => {
    const exit = useChartTypeAuthoringExit({
        projectUuid: 'project-1',
        ...args,
    });
    const performExit = () => {
        exit.cleanupAbandonedType();
        onExit();
    };
    return (
        <div>
            <button type="button" onClick={() => exit.requestExit(performExit)}>
                Done
            </button>
            {exit.isConfirmOpen && (
                <BuildInProgressExitModal
                    exitDiscardsBuild={exit.exitDiscardsBuild}
                    onKeepBuilding={exit.keepBuilding}
                    onConfirmExit={() => exit.confirmExit(performExit)}
                />
            )}
        </div>
    );
};

const harnessProps = (overrides: Partial<HarnessProps> = {}): HarnessProps => ({
    dataAppVizUuid: 'viz-1',
    createdInSession: false,
    isBuilding: false,
    draft: null,
    discard: null,
    latestReadyVersion: 1,
    isHistoryLoading: false,
    isLatestVersionInProgress: false,
    onExit: vi.fn(),
    ...overrides,
});

describe('useChartTypeAuthoringExit', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('exits straight away when nothing is building', async () => {
        const onExit = vi.fn();
        renderWithProviders(<Harness {...harnessProps({ onExit })} />);

        await userEvent.click(screen.getByRole('button', { name: 'Done' }));

        expect(onExit).toHaveBeenCalledTimes(1);
        expect(screen.queryByText('Build in progress')).not.toBeInTheDocument();
    });

    it('opens a danger confirm for a running first build and discards it on accept', async () => {
        const onExit = vi.fn();
        const discard = vi.fn();
        renderWithProviders(
            <Harness
                {...harnessProps({
                    onExit,
                    isBuilding: true,
                    draft,
                    discard,
                    dataAppVizUuid: 'viz-new',
                    latestReadyVersion: null,
                })}
            />,
        );

        await userEvent.click(screen.getByRole('button', { name: 'Done' }));

        expect(
            screen.getByText(
                'Leaving now discards the build that is still running.',
            ),
        ).toBeInTheDocument();
        expect(onExit).not.toHaveBeenCalled();
        expect(discard).not.toHaveBeenCalled();

        await userEvent.click(
            screen.getByRole('button', { name: 'Discard and leave' }),
        );

        expect(discard).toHaveBeenCalledTimes(1);
        expect(onExit).toHaveBeenCalledTimes(1);
    });

    it('opens an info confirm for a running revision build and never discards it', async () => {
        const onExit = vi.fn();
        const discard = vi.fn();
        renderWithProviders(
            <Harness
                {...harnessProps({
                    onExit,
                    isBuilding: true,
                    draft: null,
                    discard,
                })}
            />,
        );

        await userEvent.click(screen.getByRole('button', { name: 'Done' }));

        expect(
            screen.getByText(
                'The build keeps running and lands in version history when it finishes.',
            ),
        ).toBeInTheDocument();

        await userEvent.click(screen.getByRole('button', { name: 'Leave' }));

        expect(discard).not.toHaveBeenCalled();
        expect(onExit).toHaveBeenCalledTimes(1);
    });

    it('keeps building and stays open when the confirm is dismissed', async () => {
        const onExit = vi.fn();
        renderWithProviders(
            <Harness
                {...harnessProps({
                    onExit,
                    isBuilding: true,
                    draft,
                    discard: vi.fn(),
                })}
            />,
        );

        await userEvent.click(screen.getByRole('button', { name: 'Done' }));
        await userEvent.click(
            screen.getByRole('button', { name: 'Keep building' }),
        );

        expect(onExit).not.toHaveBeenCalled();
        expect(screen.queryByText('Build in progress')).not.toBeInTheDocument();
    });

    it('deletes a type created in this session that never got a ready version', async () => {
        const onExit = vi.fn();
        renderWithProviders(
            <Harness
                {...harnessProps({
                    onExit,
                    createdInSession: true,
                    dataAppVizUuid: 'viz-new',
                    latestReadyVersion: null,
                })}
            />,
        );

        await userEvent.click(screen.getByRole('button', { name: 'Done' }));

        expect(deleteApp).toHaveBeenCalledWith(
            expect.objectContaining({
                projectUuid: 'project-1',
                appUuid: 'viz-new',
                successTitle: 'Chart type discarded',
            }),
        );
        expect(onExit).toHaveBeenCalledTimes(1);
    });

    it('never deletes a type that was not created in this session', async () => {
        const onExit = vi.fn();
        renderWithProviders(
            <Harness
                {...harnessProps({
                    onExit,
                    createdInSession: false,
                    dataAppVizUuid: 'viz-1',
                    latestReadyVersion: null,
                })}
            />,
        );

        await userEvent.click(screen.getByRole('button', { name: 'Done' }));

        expect(deleteApp).not.toHaveBeenCalled();
        expect(onExit).toHaveBeenCalledTimes(1);
    });

    it('never deletes a type created in this session once it has a ready version', async () => {
        const onExit = vi.fn();
        renderWithProviders(
            <Harness
                {...harnessProps({
                    onExit,
                    createdInSession: true,
                    dataAppVizUuid: 'viz-1',
                    latestReadyVersion: 1,
                })}
            />,
        );

        await userEvent.click(screen.getByRole('button', { name: 'Done' }));

        expect(deleteApp).not.toHaveBeenCalled();
    });

    // Finding 1: the accept click must run the CURRENT render's exit, not a
    // closure frozen when the confirm opened.
    it('runs the exit created at accept time, not the one frozen when the confirm opened', async () => {
        const onExit = vi.fn();
        const discard = vi.fn();
        const { rerender } = renderWithProviders(
            <Harness
                {...harnessProps({
                    onExit,
                    isBuilding: true,
                    draft,
                    discard,
                    dataAppVizUuid: 'viz-new',
                    latestReadyVersion: null,
                })}
            />,
        );

        await userEvent.click(screen.getByRole('button', { name: 'Done' }));
        expect(
            screen.getByText(
                'Leaving now discards the build that is still running.',
            ),
        ).toBeInTheDocument();

        // The first build finishes while the confirm is still open: nothing
        // is running any more, so leaving no longer discards anything.
        rerender(
            <Harness
                {...harnessProps({
                    onExit,
                    isBuilding: false,
                    draft: null,
                    discard,
                    dataAppVizUuid: 'viz-new',
                    latestReadyVersion: null,
                })}
            />,
        );
        expect(
            screen.getByText(
                'The build keeps running and lands in version history when it finishes.',
            ),
        ).toBeInTheDocument();

        await userEvent.click(screen.getByRole('button', { name: 'Leave' }));

        expect(discard).not.toHaveBeenCalled();
        expect(onExit).toHaveBeenCalledTimes(1);
    });

    // Finding 2: a null `latestReadyVersion` while history is still loading
    // must not read as "never built".
    it('keeps a type while history is still loading, even with no ready version yet', async () => {
        const onExit = vi.fn();
        renderWithProviders(
            <Harness
                {...harnessProps({
                    onExit,
                    createdInSession: true,
                    dataAppVizUuid: 'viz-1',
                    latestReadyVersion: null,
                    isHistoryLoading: true,
                })}
            />,
        );

        await userEvent.click(screen.getByRole('button', { name: 'Done' }));

        expect(deleteApp).not.toHaveBeenCalled();
        expect(onExit).toHaveBeenCalledTimes(1);
    });

    // Finding 3(a): a build not owned by this session (e.g. found running in
    // history after a reload) must still gate the exit with a confirm.
    it('opens the confirm for a version in progress even when the local build flag is false', async () => {
        const onExit = vi.fn();
        renderWithProviders(
            <Harness
                {...harnessProps({
                    onExit,
                    isBuilding: false,
                    draft: null,
                    isLatestVersionInProgress: true,
                })}
            />,
        );

        await userEvent.click(screen.getByRole('button', { name: 'Done' }));

        expect(
            screen.getByText(
                'The build keeps running and lands in version history when it finishes.',
            ),
        ).toBeInTheDocument();
        expect(onExit).not.toHaveBeenCalled();
    });

    // Finding 3(b): the delete branch must not fire while a version is still
    // building server-side, even once the local build flag has reset.
    it('never deletes a type while its latest version is still in progress', async () => {
        const onExit = vi.fn();
        renderWithProviders(
            <Harness
                {...harnessProps({
                    onExit,
                    createdInSession: true,
                    dataAppVizUuid: 'viz-new',
                    latestReadyVersion: null,
                    isLatestVersionInProgress: true,
                })}
            />,
        );

        await userEvent.click(screen.getByRole('button', { name: 'Done' }));
        await userEvent.click(screen.getByRole('button', { name: 'Leave' }));

        expect(deleteApp).not.toHaveBeenCalled();
        expect(onExit).toHaveBeenCalledTimes(1);
    });
});
