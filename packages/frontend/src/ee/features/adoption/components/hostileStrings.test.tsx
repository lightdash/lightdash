import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../testing/testUtils';
import { MapInspector } from '../map/MapInspector';
import { dept, memberFixture } from '../utils/adoptionFixtures';
import { DepartmentDrawer } from './DepartmentDrawer';
import { DepartmentsTable } from './DepartmentsTable';
import { TopContentList } from './TopContentList';

// Markup, a double quote and a javascript: URL in every string a person can type
const hostile = (label: string) =>
    `${label} "><img src=x onerror=alert(1)> javascript:alert(1)`;
const NAME = hostile('Department');
const OWNER = hostile('Owner');
const NOTE = hostile('Note');
const DASHBOARD = hostile('Dashboard');
const PERSON = hostile('Person');

vi.mock('../../../../components/EChartsReactWrapper', () => ({
    default: () => null,
}));
const { mutation } = vi.hoisted(() => ({
    mutation: () => ({ mutateAsync: vi.fn(), isLoading: false }),
}));
vi.mock('../../../hooks/useOrgDepartments', () => ({
    useCreateDepartment: mutation,
    useUpdateDepartment: mutation,
    useDeleteDepartment: mutation,
    useSetDepartmentOwners: mutation,
    useSetDepartmentGroups: mutation,
    useSetDepartmentMembers: mutation,
    useDepartmentMembership: () => ({ data: [] }),
}));
vi.mock('../../../../hooks/useOrganizationUsers', () => ({
    useOrganizationUsers: () => ({ data: [] }),
}));
vi.mock('../../../../hooks/useOrganizationGroups', () => ({
    useOrganizationGroups: () => ({ data: [] }),
}));

const hostileDepartment = dept(NAME, null, 50, {
    departmentUuid: 'hostile',
    headcountNote: NOTE,
    owners: [{ type: 'user', uuid: 'owner', name: OWNER }],
});
const child = dept(hostile('Child'), 'hostile', 20, {
    departmentUuid: 'child',
});

// Present as text: some element's own text holds the whole string, unescaped
const expectLiteral = (text: string) =>
    expect(
        screen.getAllByText((content) => content.includes(text)).length,
    ).toBeGreaterThan(0);

const expectNothingInjected = () => {
    expect(document.querySelector('img')).toBeNull();
    expect(document.querySelector('[onerror]')).toBeNull();
    document
        .querySelectorAll('[href]')
        .forEach((element) =>
            expect(
                element.getAttribute('href')?.trim().toLowerCase(),
            ).not.toMatch(/^javascript:/),
        );
};

describe('typed strings render as text', () => {
    it('in the list table', () => {
        renderWithProviders(
            <MemoryRouter>
                <DepartmentsTable
                    departments={[hostileDepartment, child]}
                    canManage
                    onEdit={vi.fn()}
                />
            </MemoryRouter>,
        );
        expect(screen.getByRole('link', { name: NAME })).toHaveAttribute(
            'href',
            '/generalSettings/adoption/hostile',
        );
        expectLiteral(OWNER);
        expectLiteral(NOTE);
        expectNothingInjected();
    });

    it('in the drawer and its delete confirmation', async () => {
        renderWithProviders(
            <MemoryRouter>
                <DepartmentDrawer
                    opened
                    onClose={vi.fn()}
                    department={hostileDepartment}
                    departments={[hostileDepartment, child]}
                    members={[
                        memberFixture('p1', null, {
                            firstName: PERSON,
                            departmentUuid: 'hostile',
                        }),
                    ]}
                />
            </MemoryRouter>,
        );
        expectLiteral(`Edit ${NAME}`);
        expect(screen.getByLabelText(/^Name/)).toHaveValue(NAME);
        expect(screen.getByLabelText('Headcount note')).toHaveValue(NOTE);
        expectLiteral(PERSON);
        await userEvent.click(
            screen.getByRole('button', { name: 'Delete department' }),
        );
        expectLiteral(`Delete ${NAME}`);
        expectNothingInjected();
    });

    it('in the map inspector', () => {
        renderWithProviders(
            <MemoryRouter>
                <MapInspector
                    department={hostileDepartment}
                    subDepartments={[child]}
                    totals={{ people: 50, members: 5, active: 1 }}
                    member={memberFixture('p1', null, {
                        firstName: PERSON,
                        departmentName: NAME,
                    })}
                    canManage
                    onDepartmentClick={vi.fn()}
                    onClearMember={vi.fn()}
                    onEdit={vi.fn()}
                />
            </MemoryRouter>,
        );
        expectLiteral(NAME);
        expectLiteral(OWNER);
        expectLiteral(PERSON);
        expectLiteral(hostile('Child'));
        expectNothingInjected();
    });

    it('in the top content list', () => {
        renderWithProviders(
            <TopContentList
                title="Dashboards"
                unit="views"
                items={[
                    { id: 'd1', name: DASHBOARD, count: 3, distinctPeople: 2 },
                ]}
            />,
        );
        expectLiteral(DASHBOARD);
        expectNothingInjected();
    });
});
