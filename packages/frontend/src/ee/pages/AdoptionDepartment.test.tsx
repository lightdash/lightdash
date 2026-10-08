import { screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../testing/testUtils';
import AdoptionDepartment from './AdoptionDepartment';

const DEPARTMENT = '11111111-2222-4333-8444-555555555555';

const detail = vi.fn();
const summary = vi.fn();
vi.mock('../hooks/useOrgDepartments', () => ({
    useDepartmentDetail: (departmentUuid: string | undefined) =>
        detail(departmentUuid),
    useOrgAdoptionSummary: (enabled: boolean) => summary(enabled),
}));
vi.mock('../features/adoption/components/WeeklyActiveChart', () => ({
    WeeklyActiveChart: () => <div data-testid="weekly-chart" />,
}));

const renderPage = (segment: string = DEPARTMENT) =>
    renderWithProviders(
        <MemoryRouter initialEntries={[`/generalSettings/adoption/${segment}`]}>
            <Routes>
                <Route
                    path="/generalSettings/adoption/:departmentUuid"
                    element={<AdoptionDepartment />}
                />
            </Routes>
        </MemoryRouter>,
    );

const failure = (statusCode: number) => ({
    isInitialLoading: false,
    isError: true,
    data: undefined,
    error: { error: { statusCode, message: 'nope' } },
});

describe('AdoptionDepartment', () => {
    beforeEach(() => {
        detail.mockReset();
        summary.mockReset();
        summary.mockReturnValue({ data: undefined });
    });

    it('says the department was not found on a 404, with a way back', () => {
        detail.mockReturnValue(failure(404));
        renderPage();
        expect(screen.getByText('Department not found')).toBeVisible();
        expect(
            screen.getByRole('link', { name: 'Back to adoption' }),
        ).toHaveAttribute('href', '/generalSettings/adoption');
    });
    it('says there is no access on a 403, with a way back', () => {
        detail.mockReturnValue(failure(403));
        renderPage();
        expect(
            screen.getByText("You don't have access to this department"),
        ).toBeVisible();
        expect(
            screen.getByRole('link', { name: 'Back to adoption' }),
        ).toBeVisible();
    });
    it('asks for the department named by a real uuid', () => {
        detail.mockReturnValue(failure(404));
        renderPage();
        expect(detail).toHaveBeenCalledWith(DEPARTMENT);
    });
    it.each([
        ['a word', 'ops'],
        ['an encoded path that climbs out', '..%2F..%2Fuser'],
        ['an encoded query string', 'x%3Fa%3D1'],
        ['the membership route', 'membership'],
        ['a uuid with something after it', `${DEPARTMENT}x`],
    ])('shows not found for %s and requests nothing', (_label, segment) => {
        detail.mockReturnValue({
            isInitialLoading: false,
            isError: false,
            data: undefined,
            error: null,
        });
        renderPage(segment);
        expect(screen.getByText('Department not found')).toBeVisible();
        expect(
            screen.getByRole('link', { name: 'Back to adoption' }),
        ).toBeVisible();
        // The hooks are told there is no department, so neither fetches
        detail.mock.calls.forEach(([departmentUuid]) =>
            expect(departmentUuid).toBeUndefined(),
        );
        summary.mock.calls.forEach(([enabled]) => expect(enabled).toBe(false));
    });
});
