import { type ApiAppVersionSummary, type DataAppViz } from '@lightdash/common';
import { act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHookWithProviders } from '../../../testing/testUtils';
import {
    useAppVersionHistory,
    type AppVersionHistory,
} from '../../apps/hooks/useAppVersionHistory';
import { useClarificationRound } from '../../apps/hooks/useClarificationRound';
import { useDataAppModelSelection } from '../../apps/hooks/useDataAppModelSelection';
import { useSdkUpgradeStatus } from '../../apps/hooks/useSdkUpgradeStatus';
import { appVersion } from '../../apps/testing/appVersionHistory';
import { useDataAppVisualization } from '../hooks/useDataAppVisualization';
import {
    useDataAppVizBuild,
    type VizBuildRequest,
} from '../hooks/useDataAppVizBuild';
import { clarificationStub } from '../testing/clarificationRoundStub';
import { buildStub } from '../testing/dataAppVizBuildStub';
import {
    useChartTypeBuilderWorkspace,
    type ChartTypeBuilderWorkspaceArgs,
} from './useChartTypeBuilderWorkspace';

vi.mock('../hooks/useDataAppVizBuild', () => ({
    useDataAppVizBuild: vi.fn(),
}));
vi.mock('../../apps/hooks/useClarificationRound', () => ({
    useClarificationRound: vi.fn(),
}));
vi.mock('../../apps/hooks/useAppVersionHistory', () => ({
    useAppVersionHistory: vi.fn(),
}));
vi.mock('../../apps/hooks/useAppBuildPoller', () => ({
    useAppBuildPoller: vi.fn(),
}));
vi.mock('../../apps/hooks/useDataAppModelSelection', () => ({
    useDataAppModelSelection: vi.fn(),
}));
vi.mock('../../apps/hooks/useSdkUpgradeStatus', () => ({
    useSdkUpgradeStatus: vi.fn(),
}));
vi.mock('../hooks/useDataAppVisualization', () => ({
    useDataAppVisualization: vi.fn(),
}));

const historyStub = (
    versions: ApiAppVersionSummary[],
    latestReadyVersion: number | null,
): AppVersionHistory => ({
    versions,
    oldest: versions.length ? versions[versions.length - 1] : null,
    latest: versions.length ? versions[0] : null,
    latestReadyVersion,
    hasOrigin: versions.some((v) => v.version === 1),
    hasEarlier: false,
    isLoading: false,
    isError: false,
    isFetchingEarlier: false,
    fetchEarlier: vi.fn(),
});

const mockedClarificationRound = vi.mocked(
    useClarificationRound<VizBuildRequest>,
);
const clearPick = vi.fn();
const resetClarification = vi.fn();

const renderWorkspace = (args: Partial<ChartTypeBuilderWorkspaceArgs> = {}) =>
    renderHookWithProviders(
        (props: ChartTypeBuilderWorkspaceArgs) =>
            useChartTypeBuilderWorkspace(props),
        undefined,
        {
            initialProps: {
                projectUuid: 'project-1',
                dataAppVizUuid: 'viz-1',
                creationExperience: 'chart_type_builder' as const,
                itemsMap: {},
                ...args,
            },
        },
    );

describe('useChartTypeBuilderWorkspace', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(useDataAppVizBuild).mockReturnValue(buildStub());
        mockedClarificationRound.mockReturnValue(
            clarificationStub({ reset: resetClarification }),
        );
        vi.mocked(useAppVersionHistory).mockReturnValue(
            historyStub([appVersion({ version: 1 })], 1),
        );
        vi.mocked(useDataAppModelSelection).mockReturnValue({
            clearPick,
        } as unknown as ReturnType<typeof useDataAppModelSelection>);
        vi.mocked(useSdkUpgradeStatus).mockReturnValue({
            offer: { status: 'unknown' },
            renderedManifest: null,
            onSdkManifest: vi.fn(),
        } as unknown as ReturnType<typeof useSdkUpgradeStatus>);
        vi.mocked(useDataAppVisualization).mockReturnValue({
            data: undefined,
            isFetching: false,
        } as unknown as ReturnType<typeof useDataAppVisualization>);
    });

    it('asks clarifying questions only while no viz exists yet', () => {
        const { rerender } = renderWorkspace({ dataAppVizUuid: null });
        expect(mockedClarificationRound).toHaveBeenLastCalledWith(
            expect.objectContaining({ isFirstBuild: true }),
        );

        rerender({
            projectUuid: 'project-1',
            dataAppVizUuid: 'viz-1',
            creationExperience: 'chart_type_builder',
            itemsMap: {},
        });
        expect(mockedClarificationRound).toHaveBeenLastCalledWith(
            expect.objectContaining({ isFirstBuild: false }),
        );
    });

    it('resets the session when the host moves to another viz', () => {
        const { result, rerender } = renderWorkspace();
        act(() => {
            result.current.openHistory();
            result.current.onViewVersion(1);
        });
        expect(result.current.viewedVersion).toBe(1);
        clearPick.mockClear();
        resetClarification.mockClear();

        rerender({
            projectUuid: 'project-1',
            dataAppVizUuid: 'viz-2',
            creationExperience: 'chart_type_builder',
            itemsMap: {},
        });

        expect(result.current.isHistoryOpen).toBe(false);
        expect(result.current.viewedVersion).toBeNull();
        expect(result.current.promptSessionKey).toBe('viz-2');
        expect(clearPick).toHaveBeenCalledTimes(1);
        expect(resetClarification).toHaveBeenCalledTimes(1);
    });

    it('keeps the session when the host adopts the uuid a first build claimed', () => {
        const { result, rerender } = renderWorkspace({ dataAppVizUuid: null });
        expect(result.current.promptSessionKey).toBe('draft-app-1');
        act(() => result.current.openHistory());
        clearPick.mockClear();
        resetClarification.mockClear();

        rerender({
            projectUuid: 'project-1',
            dataAppVizUuid: 'viz-1',
            creationExperience: 'chart_type_builder',
            itemsMap: {},
        });

        expect(result.current.isHistoryOpen).toBe(true);
        expect(result.current.promptSessionKey).toBe('draft-app-1');
        expect(clearPick).not.toHaveBeenCalled();
        expect(resetClarification).not.toHaveBeenCalled();
    });

    it('drops a pinned version once a newer build lands past it', () => {
        vi.mocked(useAppVersionHistory).mockReturnValue(
            historyStub(
                [appVersion({ version: 2 }), appVersion({ version: 1 })],
                2,
            ),
        );
        const { result, rerender } = renderWorkspace();
        act(() => result.current.onViewVersion(1));
        expect(result.current.previewVersion).toBe(1);

        vi.mocked(useAppVersionHistory).mockReturnValue(
            historyStub(
                [
                    appVersion({ version: 3 }),
                    appVersion({ version: 2 }),
                    appVersion({ version: 1 }),
                ],
                3,
            ),
        );
        rerender({
            projectUuid: 'project-1',
            dataAppVizUuid: 'viz-1',
            creationExperience: 'chart_type_builder',
            itemsMap: {},
        });

        expect(result.current.viewedVersion).toBeNull();
        expect(result.current.previewVersion).toBe(3);
    });

    it('fetches the schema of the previewed version and returns to current when history closes', () => {
        vi.mocked(useAppVersionHistory).mockReturnValue(
            historyStub(
                [appVersion({ version: 2 }), appVersion({ version: 1 })],
                2,
            ),
        );
        const { result } = renderWorkspace();
        act(() => {
            result.current.openHistory();
            result.current.onViewVersion(1);
        });
        expect(vi.mocked(useDataAppVisualization)).toHaveBeenLastCalledWith(
            'project-1',
            'viz-1',
            1,
        );

        act(() => result.current.closeHistory());

        expect(result.current.isHistoryOpen).toBe(false);
        expect(result.current.viewedVersion).toBeNull();
        expect(result.current.previewVersion).toBe(2);
    });

    it('explains a failed build only while nothing is renderable', () => {
        vi.mocked(useAppVersionHistory).mockReturnValue(
            historyStub(
                [
                    appVersion({
                        version: 1,
                        status: 'error',
                        statusMessage: 'Sandbox crashed',
                    }),
                ],
                null,
            ),
        );
        const { result, rerender } = renderWorkspace();
        expect(result.current.failureMessage).toBe('Sandbox crashed');
        expect(result.current.previewVersion).toBeNull();

        vi.mocked(useAppVersionHistory).mockReturnValue(
            historyStub(
                [
                    appVersion({
                        version: 2,
                        status: 'error',
                        statusMessage: 'Sandbox crashed',
                    }),
                    appVersion({ version: 1 }),
                ],
                1,
            ),
        );
        rerender({
            projectUuid: 'project-1',
            dataAppVizUuid: 'viz-1',
            creationExperience: 'chart_type_builder',
            itemsMap: {},
        });
        expect(result.current.failureMessage).toBeNull();
        expect(result.current.previewVersion).toBe(1);
    });

    it('discards a first build but only cancels a revision', () => {
        const discard = vi.fn();
        const cancel = vi.fn();
        vi.mocked(useDataAppVizBuild).mockReturnValue(
            buildStub({
                isBuilding: true,
                draft: {
                    appUuid: 'viz-new',
                    version: 1,
                    startedAt: new Date(),
                },
                discard,
                cancel,
            }),
        );
        const { result, rerender } = renderWorkspace({ dataAppVizUuid: null });
        expect(result.current.onCancelBuild).toBe(discard);

        vi.mocked(useDataAppVizBuild).mockReturnValue(
            buildStub({ isBuilding: true, draft: null, discard, cancel }),
        );
        rerender({
            projectUuid: 'project-1',
            dataAppVizUuid: 'viz-1',
            creationExperience: 'chart_type_builder',
            itemsMap: {},
        });
        expect(result.current.onCancelBuild).toBe(cancel);
    });

    it('scopes the composer to the viz, the claimed app, then the draft', () => {
        const { result, rerender } = renderWorkspace({ dataAppVizUuid: null });
        expect(result.current.composerAppUuid).toBe('draft-app-1');

        vi.mocked(useDataAppVizBuild).mockReturnValue(
            buildStub({ appUuid: 'viz-claimed' }),
        );
        rerender({
            projectUuid: 'project-1',
            dataAppVizUuid: null,
            creationExperience: 'chart_type_builder',
            itemsMap: {},
        });
        expect(result.current.composerAppUuid).toBe('viz-claimed');
        expect(vi.mocked(useAppVersionHistory)).toHaveBeenLastCalledWith(
            'project-1',
            'viz-claimed',
        );

        rerender({
            projectUuid: 'project-1',
            dataAppVizUuid: 'viz-1',
            creationExperience: 'chart_type_builder',
            itemsMap: {},
        });
        expect(result.current.composerAppUuid).toBe('viz-1');
    });

    it('exposes the previewed schema for hosts to build a context from', () => {
        const dataAppViz = { dataAppVizUuid: 'viz-1' } as DataAppViz;
        vi.mocked(useDataAppVisualization).mockReturnValue({
            data: dataAppViz,
            isFetching: true,
        } as unknown as ReturnType<typeof useDataAppVisualization>);
        const { result } = renderWorkspace();
        expect(result.current.dataAppViz).toBe(dataAppViz);
        expect(result.current.isFetchingSchema).toBe(true);
    });
});
