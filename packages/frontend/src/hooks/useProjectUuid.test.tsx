import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const PROJECT_UUID = '0f1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const OTHER_PROJECT_UUID = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';

let routeProjectParam: string | undefined;
vi.mock('react-router', () => ({
    useParams: () => ({ projectUuid: routeProjectParam }),
}));

let projectRouteContext: { projectUuid: string } | null;
vi.mock('./useProjectRoute', () => ({
    useOptionalProjectRoute: () => projectRouteContext,
}));

let embedProjectUuid: string | undefined;
vi.mock('../ee/providers/Embed/useEmbed', () => ({
    default: () => ({ projectUuid: embedProjectUuid }),
}));

const useProjectsMock = vi.fn();
vi.mock('./useProjects', () => ({
    useProjects: (options: { enabled: boolean }) => useProjectsMock(options),
}));

import { useProjectUuid } from './useProjectUuid';

describe('useProjectUuid', () => {
    beforeEach(() => {
        routeProjectParam = undefined;
        projectRouteContext = null;
        embedProjectUuid = undefined;
        useProjectsMock.mockReset();
        useProjectsMock.mockReturnValue({
            data: [
                { projectUuid: PROJECT_UUID, slug: 'my-project' },
                { projectUuid: OTHER_PROJECT_UUID, slug: 'other-project' },
            ],
        });
    });

    it('prefers the uuid resolved by ProjectRoute', () => {
        projectRouteContext = { projectUuid: PROJECT_UUID };
        routeProjectParam = 'my-project';

        const { result } = renderHook(() => useProjectUuid());

        expect(result.current).toBe(PROJECT_UUID);
        expect(useProjectsMock).toHaveBeenCalledWith({ enabled: false });
    });

    it('returns a uuid url param as is without fetching projects', () => {
        routeProjectParam = PROJECT_UUID;

        const { result } = renderHook(() => useProjectUuid());

        expect(result.current).toBe(PROJECT_UUID);
        expect(useProjectsMock).toHaveBeenCalledWith({ enabled: false });
    });

    it('resolves a slug url param outside ProjectRoute', () => {
        routeProjectParam = 'other-project';

        const { result } = renderHook(() => useProjectUuid());

        expect(result.current).toBe(OTHER_PROJECT_UUID);
        expect(useProjectsMock).toHaveBeenCalledWith({ enabled: true });
    });

    it('never returns the raw slug while projects are loading', () => {
        routeProjectParam = 'other-project';
        useProjectsMock.mockReturnValue({ data: undefined });

        const { result } = renderHook(() => useProjectUuid());

        expect(result.current).toBeUndefined();
    });

    it('returns undefined for a slug that does not match a project', () => {
        routeProjectParam = 'unknown-project';

        const { result } = renderHook(() => useProjectUuid());

        expect(result.current).toBeUndefined();
    });

    it('falls back to the embed project uuid without a url param', () => {
        embedProjectUuid = PROJECT_UUID;

        const { result } = renderHook(() => useProjectUuid());

        expect(result.current).toBe(PROJECT_UUID);
        expect(useProjectsMock).toHaveBeenCalledWith({ enabled: false });
    });
});
