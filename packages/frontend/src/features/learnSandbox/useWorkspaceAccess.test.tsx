import { ProjectType } from '@lightdash/common';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
    route: null as null | {
        projectUuid: string;
        project: { type: ProjectType; upstreamProjectUuid?: string };
    },
    projects: undefined as
        | undefined
        | { projectUuid: string; type: ProjectType }[],
    open: true,
    settled: true,
}));
vi.mock('../../hooks/useProjectRoute', () => ({
    useOptionalProjectRoute: () => state.route,
}));
vi.mock('../../hooks/useProjects', () => ({
    useProjects: () => ({
        data: state.projects,
        isLoading: state.projects === undefined,
    }),
}));
vi.mock('../learn/availability', () => ({
    useLearnAvailability: () => ({
        isGateOpen: () => state.open,
        isSettled: state.settled,
    }),
}));
import { useWorkspaceAccess } from './useWorkspaceAccess';

describe('useWorkspaceAccess', () => {
    beforeEach(() => {
        state.projects = [
            { projectUuid: 'training', type: ProjectType.TRAINING },
        ];
        state.route = {
            projectUuid: 'copy',
            project: {
                type: ProjectType.PREVIEW,
                upstreamProjectUuid: 'training',
            },
        };
        state.open = true;
        state.settled = true;
    });
    it('is loading until projects and health settle', () => {
        state.projects = undefined;
        expect(renderHook(() => useWorkspaceAccess()).result.current).toEqual({
            state: 'loading',
        });
        state.projects = [
            { projectUuid: 'training', type: ProjectType.TRAINING },
        ];
        state.settled = false;
        expect(renderHook(() => useWorkspaceAccess()).result.current).toEqual({
            state: 'loading',
        });
    });
    it('is ready on the learner training copy', () => {
        expect(renderHook(() => useWorkspaceAccess()).result.current).toEqual({
            state: 'ready',
            projectUuid: 'copy',
            trainingProjectUuid: 'training',
        });
    });
    it('redirects to the library from the shared training project and from real projects', () => {
        state.route = {
            projectUuid: 'training',
            project: { type: ProjectType.TRAINING },
        };
        expect(renderHook(() => useWorkspaceAccess()).result.current).toEqual({
            state: 'redirect',
            to: '/projects/training/learn',
        });
        state.route = {
            projectUuid: 'real',
            project: { type: ProjectType.DEFAULT },
        };
        expect(renderHook(() => useWorkspaceAccess()).result.current).toEqual({
            state: 'redirect',
            to: '/projects/training/learn',
        });
    });
    it('redirects when the sandbox gate is closed', () => {
        state.open = false;
        expect(renderHook(() => useWorkspaceAccess()).result.current).toEqual({
            state: 'redirect',
            to: '/projects/training/learn',
        });
    });
    it('redirects to /projects when the org has no training project', () => {
        state.projects = [];
        expect(renderHook(() => useWorkspaceAccess()).result.current).toEqual({
            state: 'redirect',
            to: '/projects',
        });
    });
});
