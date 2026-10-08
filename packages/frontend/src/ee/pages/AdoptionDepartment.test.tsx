import {
    type DepartmentDetail,
    type OrganizationAdoptionSummary,
} from '@lightdash/common';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../testing/testUtils';
import {
    dept,
    metricsFixture,
} from '../features/adoption/utils/adoptionFixtures';
import { type WeeklyComparisonPoint } from '../features/adoption/utils/departmentDetail';
import AdoptionDepartment from './AdoptionDepartment';

const DEPARTMENT = '11111111-2222-4333-8444-555555555555';

const detail = vi.fn();
const summary = vi.fn();
const chartWeeks = vi.fn();
vi.mock('../hooks/useOrgDepartments', () => ({
    useDepartmentDetail: (departmentUuid: string | undefined) =>
        detail(departmentUuid),
    useOrgAdoptionSummary: (enabled: boolean) => summary(enabled),
}));
vi.mock('../features/adoption/components/WeeklyActiveChart', () => ({
    WeeklyActiveChart: ({ weeks }: { weeks: WeeklyComparisonPoint[] }) => {
        chartWeeks(weeks);
        return <div data-testid="weekly-chart" />;
    },
}));
const WEEK_STARTS = ['2026-09-21', '2026-09-28', '2026-10-05'];
const LONG_NOTE =
    'Headcount from the HR export of September 2026, contractors and interns excluded, reviewed by the people team';

const departmentDetail = (): DepartmentDetail => {
    const metrics = metricsFixture(191, 174, {
        activeCount30d: 85,
        activePct: 77,
        roleSplit: {
            viewers: 129,
            interactiveViewers: 40,
            editors: 20,
            admins: 2,
        },
        weeklyActive: WEEK_STARTS.map((weekStart, i) => ({
            weekStart,
            activeUsers: [50, 60, 40][i],
        })),
    });
    return {
        department: dept('Data', null, null, {
            departmentUuid: DEPARTMENT,
            headcount: 110,
            effectiveHeadcount: 110,
            headcountNote: LONG_NOTE,
            metrics,
            directMetrics: metrics,
        }),
        ancestors: [],
        children: [
            dept('Science', DEPARTMENT, null, {
                headcount: 8,
                effectiveHeadcount: 8,
                metrics: metricsFixture(9, 113, {
                    activeCount30d: 9,
                    activePct: 113,
                }),
            }),
            dept('Engineering', DEPARTMENT, null, {
                headcount: 34,
                effectiveHeadcount: 34,
                metrics: metricsFixture(33, 97),
            }),
        ],
        targetProgress: null,
        weeklyActive: metrics.weeklyActive.map((point) => ({
            ...point,
            orgAverage: 12,
        })),
        topContent: { dashboards: [], explores: [], aiAgents: [] },
        members: [],
    };
};

const organizationSummary = (): OrganizationAdoptionSummary => ({
    organization: metricsFixture(2000, null, {
        weeklyActive: WEEK_STARTS.map((weekStart, i) => ({
            weekStart,
            activeUsers: [1000, 500, 250][i],
        })),
    }),
    departments: [],
    attention: { conflictCount: 0, unassignedCount: 0 },
});

const loaded = (data: DepartmentDetail) => ({
    isInitialLoading: false,
    isError: false,
    data,
    error: null,
});

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

    describe('with a department loaded', () => {
        beforeEach(() => {
            chartWeeks.mockReset();
            detail.mockReturnValue(loaded(departmentDetail()));
        });

        it('asks for the organization numbers whoever is viewing', () => {
            renderPage();
            expect(summary).toHaveBeenCalledWith(true);
        });
        it("compares each week with the organization's rate applied to this department", () => {
            summary.mockReturnValue({ data: organizationSummary() });
            renderPage();
            // 1,000, 500 and 250 of 2,000 active, applied to 191 on Lightdash
            expect(chartWeeks).toHaveBeenLastCalledWith([
                { weekStart: '2026-09-21', activeUsers: 50, atOrgRate: 95.5 },
                { weekStart: '2026-09-28', activeUsers: 60, atOrgRate: 47.8 },
                { weekStart: '2026-10-05', activeUsers: 40, atOrgRate: 23.9 },
            ]);
        });
        it('draws the department alone until the organization numbers arrive', () => {
            renderPage();
            expect(chartWeeks).toHaveBeenLastCalledWith(
                WEEK_STARTS.map((weekStart, i) => ({
                    weekStart,
                    activeUsers: [50, 60, 40][i],
                    atOrgRate: null,
                })),
            );
        });
        it('shows coverage above 100% with the counts behind it and says why', () => {
            renderPage();
            const tile = screen.getByRole('group', { name: 'Coverage' });
            expect(within(tile).getByText('174% (191 of 110)')).toBeVisible();
            expect(
                within(tile).getByText('More accounts than headcount'),
            ).toBeVisible();
        });
        it('explains coverage and activity above 100% in the sub-department rows', () => {
            renderPage();
            const science = screen.getByRole('row', { name: /Science/ });
            // Coverage and Active in 30 days, each with the counts behind it and the reason
            const [coverage, active] = within(science)
                .getAllByRole('cell')
                .slice(1);
            [coverage, active].forEach((cell) => {
                expect(within(cell).getByText('113% (9 of 8)')).toBeVisible();
                expect(
                    within(cell).getByText('More accounts than headcount'),
                ).toBeVisible();
            });
            const engineering = screen.getByRole('row', {
                name: /Engineering/,
            });
            expect(within(engineering).getByText('97% (33)')).toBeVisible();
            expect(
                within(engineering).queryByText('More accounts than headcount'),
            ).not.toBeInTheDocument();
        });
        it('shows activity above the headcount with the counts behind it and says why', () => {
            const busy = departmentDetail();
            detail.mockReturnValue(
                loaded({
                    ...busy,
                    department: {
                        ...busy.department,
                        metrics: {
                            ...busy.department.metrics,
                            activeCount30d: 120,
                            activePct: 109,
                        },
                    },
                }),
            );
            renderPage();
            const tile = screen.getByRole('group', {
                name: 'Active in 30 days',
            });
            expect(within(tile).getByText('109% (120 of 110)')).toBeVisible();
            expect(
                within(tile).getByText(
                    'More accounts than headcount · 120 of the 191 with an account',
                ),
            ).toBeVisible();
        });
        it('shows the headcount note in full beside the headcount, with nothing to hover', async () => {
            renderPage();
            const note = screen.getByText(LONG_NOTE);
            expect(note).toBeVisible();
            expect(note).not.toHaveAttribute('data-truncate');
            expect(
                screen.getByText('Headcount').parentElement,
            ).toContainElement(note);
            await userEvent.hover(note);
            expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
            await userEvent.hover(screen.getByText('110'));
            expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
        });
        it('gives the role split after the headcount and the linked groups', () => {
            renderPage();
            const roles = screen.getByText('Roles');
            expect(roles.parentElement).toHaveTextContent(
                /^Roles129 viewers, 40 interactive viewers, 20 editors, 2 admins$/,
            );
            expect(
                screen
                    .getByText('Linked groups')
                    .compareDocumentPosition(roles) &
                    Node.DOCUMENT_POSITION_FOLLOWING,
            ).toBeTruthy();
        });
        it('leaves roles nobody holds out of the role split', () => {
            const few = departmentDetail();
            detail.mockReturnValue(
                loaded({
                    ...few,
                    department: {
                        ...few.department,
                        metrics: {
                            ...few.department.metrics,
                            roleSplit: {
                                viewers: 1171,
                                interactiveViewers: 0,
                                editors: 1,
                                admins: 0,
                            },
                        },
                    },
                }),
            );
            renderPage();
            expect(screen.getByText('Roles').parentElement).toHaveTextContent(
                /^Roles1,171 viewers, 1 editor$/,
            );
        });
        it('groups thousands in the header', () => {
            const big = departmentDetail();
            detail.mockReturnValue(
                loaded({
                    ...big,
                    department: {
                        ...big.department,
                        headcount: 2350,
                        effectiveHeadcount: 2350,
                        metrics: {
                            ...big.department.metrics,
                            memberCount: 221,
                        },
                    },
                }),
            );
            renderPage();
            expect(screen.getByText('2,350')).toBeVisible();
            expect(screen.getByText('2,129 without an account')).toBeVisible();
        });
    });
});
