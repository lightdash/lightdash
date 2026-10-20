import { waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sharedLightdashApi } from '../../api';
import { mockedLightdashApi } from '../../testing/mockedLightdashApi';
import { renderHookWithProviders } from '../../testing/testUtils';
import { useDepartmentDetail, useUpdateDepartment } from './useOrgDepartments';

vi.mock('../../api');

const DEPARTMENT = '11111111-2222-4333-8444-555555555555';

describe('useDepartmentDetail', () => {
    beforeEach(() => {
        mockedLightdashApi.mockReset();
        mockedLightdashApi.mockResolvedValue({} as never);
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
            expect(sharedLightdashApi).not.toHaveBeenCalled();
        },
    );
    it('requests the department for a uuid', async () => {
        renderHookWithProviders(() => useDepartmentDetail(DEPARTMENT));
        await waitFor(() =>
            expect(sharedLightdashApi).toHaveBeenCalledWith({
                url: `/org/departments/${DEPARTMENT}`,
                method: 'GET',
                body: undefined,
            }),
        );
    });
});

describe('department mutations', () => {
    it('keep any value inside the departments path', async () => {
        mockedLightdashApi.mockResolvedValue({} as never);
        const { result } = renderHookWithProviders(() => useUpdateDepartment());
        result.current.mutate({
            departmentUuid: '../../user',
            data: { name: 'x' },
        });
        await waitFor(() =>
            expect(sharedLightdashApi).toHaveBeenCalledWith(
                expect.objectContaining({
                    url: '/org/departments/..%2F..%2Fuser',
                    method: 'PATCH',
                }),
            ),
        );
    });
});
