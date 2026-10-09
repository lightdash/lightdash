import { waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { lightdashApi } from '../../api';
import { renderHookWithProviders } from '../../testing/testUtils';
import {
    useDepartmentDetail,
    useDepartmentOverlaps,
    useSetPrimaryDepartment,
    useUpdateDepartment,
} from './useOrgDepartments';

vi.mock('../../api', () => ({
    lightdashApi: vi.fn(),
}));

const DEPARTMENT = '11111111-2222-4333-8444-555555555555';
const SALES = '22222222-2222-4333-8444-555555555555';
const MARKETING = '33333333-2222-4333-8444-555555555555';
const GROWTH = '44444444-2222-4333-8444-555555555555';
const PERSON = '55555555-2222-4333-8444-555555555555';

describe('useDepartmentDetail', () => {
    beforeEach(() => {
        vi.mocked(lightdashApi).mockReset();
        vi.mocked(lightdashApi).mockResolvedValue({} as never);
    });

    it.each(['../../user', 'ops', `${DEPARTMENT}/../../user`])(
        'requests nothing for %s, which is not a uuid',
        async (departmentUuid) => {
            const { result } = renderHookWithProviders(() =>
                useDepartmentDetail(departmentUuid),
            );
            await new Promise((resolve) => {
                setTimeout(resolve, 20);
            });
            expect(result.current.fetchStatus).toBe('idle');
            expect(lightdashApi).not.toHaveBeenCalled();
        },
    );
    it('requests the department for a uuid', async () => {
        renderHookWithProviders(() => useDepartmentDetail(DEPARTMENT));
        await waitFor(() =>
            expect(lightdashApi).toHaveBeenCalledWith({
                url: `/org/departments/${DEPARTMENT}`,
                method: 'GET',
                body: undefined,
            }),
        );
    });
});

describe('department mutations', () => {
    it('keep any value inside the departments path', async () => {
        vi.mocked(lightdashApi).mockResolvedValue({} as never);
        const { result } = renderHookWithProviders(() => useUpdateDepartment());
        result.current.mutate({
            departmentUuid: '../../user',
            data: { name: 'x' },
        });
        await waitFor(() =>
            expect(lightdashApi).toHaveBeenCalledWith(
                expect.objectContaining({
                    url: '/org/departments/..%2F..%2Fuser',
                    method: 'PATCH',
                }),
            ),
        );
    });
});

describe('useDepartmentOverlaps', () => {
    beforeEach(() => {
        vi.mocked(lightdashApi).mockReset();
        vi.mocked(lightdashApi).mockResolvedValue({} as never);
    });

    const requestedUrl = async (
        ...args: Parameters<typeof useDepartmentOverlaps>
    ) => {
        renderHookWithProviders(() => useDepartmentOverlaps(...args));
        await waitFor(() => expect(lightdashApi).toHaveBeenCalledTimes(1));
        return vi.mocked(lightdashApi).mock.calls[0][0];
    };

    it('requests the overlaps without a list when none is given', async () => {
        expect(await requestedUrl(DEPARTMENT)).toEqual({
            url: `/org/departments/${DEPARTMENT}/overlaps`,
            method: 'GET',
            body: undefined,
        });
    });
    it('sends the departments to compare with and to leave out, comma-separated', async () => {
        const { url } = await requestedUrl(
            DEPARTMENT,
            [SALES, MARKETING],
            [GROWTH],
        );
        const [path, query] = url.split('?');
        expect(path).toBe(`/org/departments/${DEPARTMENT}/overlaps`);
        const params = new URLSearchParams(query);
        expect(params.get('with')).toBe(`${SALES},${MARKETING}`);
        expect(params.get('without')).toBe(GROWTH);
    });
    it('leaves an empty list out of the request', async () => {
        const { url } = await requestedUrl(DEPARTMENT, [], [GROWTH]);
        expect(url).toBe(
            `/org/departments/${DEPARTMENT}/overlaps?without=${GROWTH}`,
        );
    });
    it.each(['../../user', 'ops'])(
        'requests nothing for %s, which is not a uuid',
        async (departmentUuid) => {
            const { result } = renderHookWithProviders(() =>
                useDepartmentOverlaps(departmentUuid),
            );
            await new Promise((resolve) => {
                setTimeout(resolve, 20);
            });
            expect(result.current.fetchStatus).toBe('idle');
            expect(lightdashApi).not.toHaveBeenCalled();
        },
    );
});

describe('useSetPrimaryDepartment', () => {
    beforeEach(() => {
        vi.mocked(lightdashApi).mockReset();
        vi.mocked(lightdashApi).mockResolvedValue(undefined as never);
    });

    it('sets the department a person counts in', async () => {
        const { result } = renderHookWithProviders(() =>
            useSetPrimaryDepartment(),
        );
        result.current.mutate({ userUuid: PERSON, departmentUuid: SALES });
        await waitFor(() =>
            expect(lightdashApi).toHaveBeenCalledWith({
                url: `/org/departments/people/${PERSON}/primary`,
                method: 'PUT',
                body: JSON.stringify({ departmentUuid: SALES }),
            }),
        );
    });
    it('sends null to count a person everywhere again, and keeps any value inside the path', async () => {
        const { result } = renderHookWithProviders(() =>
            useSetPrimaryDepartment(),
        );
        result.current.mutate({ userUuid: '../../user', departmentUuid: null });
        await waitFor(() =>
            expect(lightdashApi).toHaveBeenCalledWith({
                url: '/org/departments/people/..%2F..%2Fuser/primary',
                method: 'PUT',
                body: JSON.stringify({ departmentUuid: null }),
            }),
        );
    });
});
