import {
    OrganizationMemberRole,
    type DepartmentDetail,
    type DepartmentMembership,
} from '@lightdash/common';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../testing/testUtils';
import AdoptionDepartment from '../../../pages/AdoptionDepartment';
import { AdoptionMap } from '../map/AdoptionMap';
import { MapInspector } from '../map/MapInspector';
import { estimateTextWidth } from '../map/mapLayout';
import { dept, memberFixture, metricsFixture } from '../utils/adoptionFixtures';
import { DepartmentDrawer } from './DepartmentDrawer';
import { DepartmentsTable } from './DepartmentsTable';
import { MembershipModal } from './MembershipModal';
import { TopContentList } from './TopContentList';

// Markup, a double quote and a javascript: URL in every string a person can type
const hostile = (label: string) =>
    `${label} "><img src=x onerror=alert(1)> javascript:alert(1)`;
const NAME = hostile('Department');
const OWNER = hostile('Owner');
const GROUP_OWNER = hostile('Group owner');
const GROUP = hostile('Group');
const NOTE = hostile('Note');
const DASHBOARD = hostile('Dashboard');
const PERSON = hostile('Person');
const SURNAME = hostile('Surname');
const EMAIL = hostile('Email');
const PARENT = hostile('Parent');
const CHILD = hostile('Child');

vi.mock('../../../../components/EChartsReactWrapper', () => ({
    default: () => null,
}));
const { mutation, hooks } = vi.hoisted(() => ({
    mutation: () => ({
        mutate: vi.fn(),
        mutateAsync: vi.fn(),
        isLoading: false,
    }),
    // What the department hooks answer; each test sets its own and it is cleared after
    hooks: {
        membership: [] as DepartmentMembership[],
        detail: undefined as DepartmentDetail | undefined,
    },
}));
vi.mock('../../../hooks/useOrgDepartments', () => ({
    useCreateDepartment: mutation,
    useUpdateDepartment: mutation,
    useDeleteDepartment: mutation,
    useSetDepartmentOwners: mutation,
    useSetDepartmentGroups: mutation,
    useSetDepartmentMembers: mutation,
    useDepartmentMembership: () => ({
        data: hooks.membership,
        isInitialLoading: false,
    }),
    useDepartmentDetail: (departmentUuid: string | undefined) => ({
        data: departmentUuid === undefined ? undefined : hooks.detail,
        isInitialLoading: false,
        isError: false,
        error: null,
    }),
    useOrgAdoptionSummary: () => ({ data: undefined }),
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
const child = dept(CHILD, 'hostile', 20, {
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
    afterEach(() => {
        hooks.membership = [];
        hooks.detail = undefined;
    });

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
                    overview={null}
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
        expectLiteral(CHILD);
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

    it("in the map's circle labels, hover titles and people", async () => {
        hooks.detail = {
            department: hostileDepartment,
            ancestors: [],
            children: [child],
            targetProgress: null,
            weeklyActive: [],
            topContent: { dashboards: [], explores: [], aiAgents: [] },
            members: [
                memberFixture('p1', null, {
                    firstName: PERSON,
                    lastName: SURNAME,
                    departmentUuid: 'hostile',
                    departmentName: NAME,
                }),
            ],
        };
        const { container } = renderWithProviders(
            <MemoryRouter>
                <AdoptionMap
                    summary={{
                        organization: metricsFixture(7, null),
                        departments: [hostileDepartment, child],
                        attention: { conflictCount: 0, unassignedCount: 0 },
                    }}
                    canManage
                    onEdit={vi.fn()}
                    measureText={estimateTextWidth}
                />
            </MemoryRouter>,
        );
        const drawn = (selector: string) =>
            Array.from(
                container.querySelectorAll(`svg[role="img"] ${selector}`),
            );
        const drawnText = (selector: string) =>
            drawn(selector).map((node) => node.textContent ?? '');
        // SVG text and titles hold the string as one text node, never as markup
        const expectSvgTextOnly = () =>
            drawn('text, title').forEach((node) =>
                expect(node.children).toHaveLength(0),
            );

        // The sub-department's label is drawn whole; both circles' hover titles start with their names
        expect(drawnText('text')).toContain(`${CHILD} · 10`);
        expect(
            drawnText('title').some((title) => title.startsWith(`${NAME},`)),
        ).toBe(true);
        expect(
            drawnText('title').some((title) => title.startsWith(`${CHILD},`)),
        ).toBe(true);
        expectSvgTextOnly();
        expectNothingInjected();

        // Inside the department, labels cut short still draw the markup as text, and each person's dot is
        // titled with the full name and labelled with the start of the first name
        await userEvent.click(
            screen.getByRole('button', {
                name: (accessibleName) => accessibleName.startsWith(`${NAME},`),
            }),
        );
        expect(drawnText('text').some((text) => text.includes('"><img'))).toBe(
            true,
        );
        expect(drawnText('title')).toContain(`${PERSON} ${SURNAME}`);
        expect(
            drawnText('text').some(
                (text) =>
                    text.endsWith('…') && PERSON.startsWith(text.slice(0, -1)),
            ),
        ).toBe(true);
        expectLiteral(`${PERSON} ${SURNAME}`);
        expectSvgTextOnly();
        expectNothingInjected();
    });

    it('on the department page: header, badges, headcount note, sub-departments and people', async () => {
        const PAGE = '11111111-2222-4333-8444-555555555555';
        const PARENT_UUID = '22222222-3333-4444-8555-666666666666';
        const CHILD_UUID = '33333333-4444-4555-8666-777777777777';
        hooks.detail = {
            department: {
                ...hostileDepartment,
                departmentUuid: PAGE,
                owners: [
                    { type: 'user', uuid: 'owner', name: OWNER },
                    { type: 'group', uuid: 'group-owner', name: GROUP_OWNER },
                ],
                linkedGroups: [{ groupUuid: 'group', name: GROUP }],
            },
            ancestors: [{ departmentUuid: PARENT_UUID, name: PARENT }],
            children: [
                {
                    ...child,
                    departmentUuid: CHILD_UUID,
                    parentDepartmentUuid: PAGE,
                },
            ],
            targetProgress: null,
            weeklyActive: [],
            topContent: {
                dashboards: [
                    { id: 'd1', name: DASHBOARD, count: 3, distinctPeople: 2 },
                ],
                explores: [],
                aiAgents: [],
            },
            members: [
                memberFixture('p1', null, {
                    firstName: PERSON,
                    lastName: SURNAME,
                    email: EMAIL,
                    departmentUuid: PAGE,
                    departmentName: NAME,
                    source: 'group',
                    sourceGroupName: GROUP,
                }),
            ],
        };
        renderWithProviders(
            <MemoryRouter
                initialEntries={[`/generalSettings/adoption/${PAGE}`]}
            >
                <Routes>
                    <Route
                        path="/generalSettings/adoption/:departmentUuid"
                        element={<AdoptionDepartment />}
                    />
                </Routes>
            </MemoryRouter>,
        );

        expect(screen.getByRole('heading', { name: NAME })).toBeVisible();
        expect(screen.getByRole('link', { name: PARENT })).toHaveAttribute(
            'href',
            `/generalSettings/adoption/${PARENT_UUID}`,
        );
        expectLiteral(OWNER);
        expectLiteral(GROUP_OWNER);
        expectLiteral(GROUP);
        expectLiteral(NOTE);
        expect(screen.getByRole('link', { name: CHILD })).toHaveAttribute(
            'href',
            `/generalSettings/adoption/${CHILD_UUID}`,
        );
        expectLiteral(DASHBOARD);
        expectLiteral(`${PERSON} ${SURNAME}`);
        expectLiteral(EMAIL);
        expectLiteral(`Group ${GROUP}`);

        // The headcount's tooltip repeats the note
        const headcount = screen.getByText('Headcount').parentElement;
        expect(headcount).not.toBeNull();
        if (headcount) await userEvent.hover(within(headcount).getByText('10'));
        expect(await screen.findByRole('tooltip')).toHaveTextContent(NOTE);
        expectNothingInjected();
    });

    it('in the placement modal rows and its department picker', async () => {
        const OTHER = hostile('Other');
        hooks.membership = [
            {
                userUuid: 'p1',
                email: EMAIL,
                firstName: PERSON,
                lastName: SURNAME,
                role: OrganizationMemberRole.VIEWER,
                resolution: {
                    kind: 'conflict',
                    departmentUuids: ['hostile', 'other'],
                },
            },
            {
                userUuid: 'p2',
                email: hostile('Unnamed'),
                firstName: '',
                lastName: '',
                role: OrganizationMemberRole.VIEWER,
                resolution: { kind: 'unassigned' },
            },
        ];
        renderWithProviders(
            <MembershipModal
                opened
                onClose={vi.fn()}
                departments={[
                    hostileDepartment,
                    dept(OTHER, null, 50, { departmentUuid: 'other' }),
                ]}
            />,
        );

        expectLiteral(`${PERSON} ${SURNAME}`);
        expectLiteral(EMAIL);
        expectLiteral(`In ${NAME} and ${OTHER}`);
        // Someone with no name is shown by their email
        expect(
            screen.getByRole('combobox', {
                name: `Department for ${hostile('Unnamed')}`,
            }),
        ).toBeInTheDocument();
        await userEvent.click(
            screen.getByRole('combobox', {
                name: `Department for ${PERSON} ${SURNAME}`,
            }),
        );
        expect(
            await screen.findByRole('option', { name: NAME }),
        ).toBeInTheDocument();
        expect(screen.getByRole('option', { name: OTHER })).toBeInTheDocument();
        expectNothingInjected();
    });
});
