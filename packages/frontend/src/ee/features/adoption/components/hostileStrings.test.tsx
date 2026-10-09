import {
    OrganizationMemberRole,
    type DepartmentDetail,
    type DepartmentMembership,
    type DepartmentOverlaps,
} from '@lightdash/common';
import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState, type FC } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../testing/testUtils';
import AdoptionDepartment from '../../../pages/AdoptionDepartment';
import { AdoptionMap } from '../map/AdoptionMap';
import { type ColourBy } from '../map/geometry';
import { MapInspector } from '../map/MapInspector';
import { estimateTextWidth } from '../map/mapLayout';
import { DotSwatch } from '../map/MapLegend';
import {
    dept,
    memberFixture,
    metricsFixture,
    placedMetricsFixture,
} from '../utils/adoptionFixtures';
import {
    getCoverageRows,
    getDepartmentBreakdown,
} from '../utils/peopleBreakdown';
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
const EXPLORE = hostile('Explore');
const AGENT = hostile('Agent');
const PROJECT = '3675b69e-8324-4110-bdca-059031aa8da3';
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
        overlaps: undefined as DepartmentOverlaps | undefined,
    },
}));
vi.mock('../../../hooks/useOrgDepartments', () => ({
    useCreateDepartment: mutation,
    useUpdateDepartment: mutation,
    useDeleteDepartment: mutation,
    useSetDepartmentOwners: mutation,
    useSetDepartmentGroups: mutation,
    useSetDepartmentMembers: mutation,
    useSetPrimaryDepartment: mutation,
    // Like the real query: nothing until it is enabled
    useDepartmentMembership: (enabled: boolean) => ({
        data: enabled ? hooks.membership : undefined,
        isInitialLoading: false,
    }),
    useDepartmentDetail: (departmentUuid: string | undefined) => ({
        data: departmentUuid === undefined ? undefined : hooks.detail,
        isInitialLoading: false,
        isError: false,
        error: null,
    }),
    useOrgAdoptionSummary: () => ({ data: undefined }),
    // The overlaps as set, and for a chosen overlap the page's own people
    useDepartmentOverlaps: (
        departmentUuid: string | undefined,
        withUuids: string[] = [],
        withoutUuids: string[] = [],
    ) => ({
        data:
            departmentUuid === undefined || hooks.overlaps === undefined
                ? undefined
                : {
                      ...hooks.overlaps,
                      members:
                          withUuids.length + withoutUuids.length === 0
                              ? null
                              : (hooks.detail?.members ?? []),
                  },
        isInitialLoading: false,
        isError: false,
    }),
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

// One of each kind of content, every name hostile, plus an explore named as a javascript: URL
const KEY_CONTENT = {
    dashboards: [
        {
            id: 'd1',
            name: DASHBOARD,
            projectUuid: PROJECT,
            count: 3,
            distinctPeople: 2,
        },
    ],
    explores: [
        {
            id: `${PROJECT}:hostile`,
            name: EXPLORE,
            projectUuid: PROJECT,
            count: 2,
            distinctPeople: 1,
        },
        {
            id: `${PROJECT}:script`,
            name: 'javascript:alert(1)',
            projectUuid: PROJECT,
            count: 1,
            distinctPeople: 1,
        },
    ],
    aiAgents: [
        {
            id: 'a1',
            name: AGENT,
            projectUuid: PROJECT,
            count: 1,
            distinctPeople: 1,
        },
    ],
};

// Every link is built from the ids and the explore's encoded name, never from a name as typed
const expectKeyContentLinks = () => {
    expect(screen.getByRole('link', { name: DASHBOARD })).toHaveAttribute(
        'href',
        `/projects/${PROJECT}/dashboards/d1/view`,
    );
    expect(screen.getByRole('link', { name: EXPLORE })).toHaveAttribute(
        'href',
        `/projects/${PROJECT}/tables/${encodeURIComponent(EXPLORE)}`,
    );
    expect(
        screen.getByRole('link', { name: 'javascript:alert(1)' }),
    ).toHaveAttribute(
        'href',
        `/projects/${PROJECT}/tables/javascript%3Aalert(1)`,
    );
    expect(screen.getByRole('link', { name: AGENT })).toHaveAttribute(
        'href',
        `/projects/${PROJECT}/ai-agents/a1`,
    );
    // A name cut short keeps the whole name in its title, as text
    expect(screen.getByRole('link', { name: DASHBOARD })).toHaveAttribute(
        'title',
        DASHBOARD,
    );
};

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

// The map with the selection and the colouring the page would hold for it
const MapOnPage: FC = () => {
    const [selectedUuid, setSelectedUuid] = useState<string | null>(null);
    const [colourBy, setColourBy] = useState<ColourBy>('activity');
    return (
        <AdoptionMap
            summary={{
                organization: metricsFixture(7, null),
                placed: placedMetricsFixture(7, 0),
                departments: [hostileDepartment, child],
                attention: { unassignedCount: 0, sharedCount: 0 },
            }}
            canManage
            selectedUuid={selectedUuid}
            onSelect={setSelectedUuid}
            colourBy={colourBy}
            onColourByChange={setColourBy}
            onEdit={vi.fn()}
            measureText={estimateTextWidth}
        />
    );
};

describe('typed strings render as text', () => {
    afterEach(() => {
        hooks.membership = [];
        hooks.detail = undefined;
        hooks.overlaps = undefined;
    });

    it('in the list table', async () => {
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
        // The note is in the headcount's tooltip
        await userEvent.hover(screen.getByText('10'));
        await screen.findByRole('tooltip');
        expectLiteral(NOTE);
        expectNothingInjected();
    });

    it('in the drawer and its delete confirmation', async () => {
        const OTHER = hostile('Other');
        renderWithProviders(
            <MemoryRouter>
                <DepartmentDrawer
                    opened
                    onClose={vi.fn()}
                    department={{
                        ...hostileDepartment,
                        explicitMemberUuids: ['p1'],
                    }}
                    departments={[
                        hostileDepartment,
                        child,
                        dept(OTHER, null, 50, { departmentUuid: 'other' }),
                    ]}
                    members={[
                        memberFixture('p1', null, {
                            firstName: PERSON,
                            departmentUuid: 'hostile',
                            sharedWith: [
                                { departmentUuid: 'other', name: OTHER },
                            ],
                        }),
                    ]}
                />
            </MemoryRouter>,
        );
        expectLiteral(`Edit ${NAME}`);
        expect(screen.getByLabelText(/^Name/)).toHaveValue(NAME);
        expect(screen.getByLabelText('Headcount note')).toHaveValue(NOTE);
        expectLiteral(PERSON);
        // The assigned person's chip names the other department as text
        expectLiteral(`also in ${OTHER}`);
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
                    parentName={PARENT}
                    breakdown={getDepartmentBreakdown(
                        hostileDepartment,
                        'activity',
                    )}
                    colourBy="activity"
                    rows={getCoverageRows([child], 'activity')}
                    member={memberFixture('p1', null, {
                        firstName: PERSON,
                        departmentUuid: 'hostile',
                        departmentName: NAME,
                        sharedWith: [{ departmentUuid: 'child', name: CHILD }],
                        primaryDepartmentUuid: 'hostile',
                    })}
                    canManage
                    keySwatch={DotSwatch}
                    onDepartmentClick={vi.fn()}
                    onClearMember={vi.fn()}
                    onEdit={vi.fn()}
                />
            </MemoryRouter>,
        );
        // The title, the parent beside it, the person selected, the sub-department and the people directly in it
        expectLiteral(NAME);
        expectLiteral(PARENT);
        expectLiteral(PERSON);
        expectLiteral(CHILD);
        expectLiteral(`Directly in ${NAME}`);
        // The departments the person is in, and the one they count in
        expectLiteral(`In 2 departments: ${CHILD}, ${NAME}`);
        expectLiteral(`Counts in: ${NAME}`);
        expect(screen.getByTitle(`Directly in ${NAME} · 5`)).toHaveTextContent(
            `Directly in ${NAME} · 5`,
        );
        expectNothingInjected();
    });

    it('in the key content lists, whose links are built from ids alone', () => {
        renderWithProviders(
            <MemoryRouter>
                <TopContentList
                    title="Dashboards"
                    kind="dashboards"
                    noun={{ one: 'view', other: 'views' }}
                    items={KEY_CONTENT.dashboards}
                />
                <TopContentList
                    title="Explores"
                    kind="explores"
                    noun={{ one: 'query', other: 'queries' }}
                    items={KEY_CONTENT.explores}
                />
                <TopContentList
                    title="AI agents"
                    kind="aiAgents"
                    noun={{ one: 'prompt', other: 'prompts' }}
                    items={KEY_CONTENT.aiAgents}
                />
            </MemoryRouter>,
        );
        [DASHBOARD, EXPLORE, AGENT].forEach(expectLiteral);
        expectKeyContentLinks();
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
                <MapOnPage />
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
        const hover = (departmentUuid: string) => {
            const circle = container.querySelector(
                `svg[role="img"] [data-department="${departmentUuid}"]`,
            );
            expect(circle).not.toBeNull();
            if (circle) fireEvent.pointerOver(circle);
        };

        // Both circles' hover titles start with their names, and the sub-department's ends with the department
        // a click opens
        expect(
            drawnText('title').some((title) => title.startsWith(`${NAME},`)),
        ).toBe(true);
        expect(
            drawnText('title').some(
                (title) =>
                    title.startsWith(`${CHILD},`) && title.endsWith(NAME),
            ),
        ).toBe(true);
        expectSvgTextOnly();
        expectNothingInjected();

        // The department is named at rest, whole; each circle's hover label is drawn whole while it is hovered
        expect(drawnText('[data-rest-label="hostile"]')).toContain(NAME);
        expect(drawn('[data-label]')).toHaveLength(0);
        hover('child');
        expect(drawnText('[data-label="child"]')).toEqual([`${CHILD} · 10`]);
        expectSvgTextOnly();
        hover('hostile');
        expect(drawnText('[data-label="hostile"]')).toContain(NAME);
        expectSvgTextOnly();
        expectNothingInjected();

        // Inside the department: the hovered labels are whole, the circles are titled with the whole name, and
        // each dot is titled with the full name, which is never drawn on the map
        await userEvent.click(
            screen.getByRole('button', {
                name: (accessibleName) => accessibleName.startsWith(`${NAME},`),
            }),
        );
        hover('child');
        expect(drawnText('[data-label="child"]')).toContain(CHILD);
        const people = container.querySelector(
            'svg[role="img"] [data-kind][data-circle="own:hostile"]',
        );
        expect(people).not.toBeNull();
        if (people) fireEvent.pointerOver(people);
        expect(drawnText('[data-label="own:hostile"]')).toContain(
            `Directly in ${NAME}`,
        );
        expect(drawnText('title').some((title) => title.includes(NAME))).toBe(
            true,
        );
        // The person's dot is titled with their full name and the part of the colouring they are in
        expect(drawnText('title')).toContain(`${PERSON} ${SURNAME} · Lost`);
        // No person's name is drawn on the map, whole or cut short
        expect(
            drawnText('text').some((text) => text.includes(PERSON.slice(0, 6))),
        ).toBe(false);
        expectLiteral(`${PERSON} ${SURNAME}`);
        expectSvgTextOnly();
        expectNothingInjected();
    });

    it('on the department page: title, breadcrumb, key content, sub-departments and people', () => {
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
            topContent: KEY_CONTENT,
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
        expect(screen.getByRole('link', { name: CHILD })).toHaveAttribute(
            'href',
            `/generalSettings/adoption/${CHILD_UUID}`,
        );
        [DASHBOARD, EXPLORE, AGENT].forEach(expectLiteral);
        expectKeyContentLinks();
        expectLiteral(`${PERSON} ${SURNAME}`);
        expectLiteral(EMAIL);
        expectLiteral(`Group ${GROUP}`);
        // Owners, linked groups and the headcount note are in Edit department, not on the page
        [OWNER, GROUP_OWNER, NOTE].forEach((text) =>
            expect(
                screen.queryAllByText((content) => content.includes(text)),
            ).toHaveLength(0),
        );
        expectNothingInjected();
    });

    it('in the overlaps: the diagram, its key, the list, the people filter and who else each person is in', async () => {
        const PAGE = '11111111-2222-4333-8444-555555555555';
        const OTHER = hostile('Other');
        const THIRD = hostile('Third');
        const other = { departmentUuid: 'other', name: OTHER };
        const third = { departmentUuid: 'third', name: THIRD };
        hooks.detail = {
            department: { ...hostileDepartment, departmentUuid: PAGE },
            ancestors: [],
            children: [],
            targetProgress: null,
            weeklyActive: [],
            topContent: { dashboards: [], explores: [], aiAgents: [] },
            members: [
                memberFixture('p1', null, {
                    firstName: PERSON,
                    departmentUuid: PAGE,
                    departmentName: NAME,
                    sharedWith: [other],
                }),
            ],
        };
        hooks.overlaps = {
            department: { departmentUuid: PAGE, name: NAME },
            overlaps: [
                { ...other, people: 1, active30d: 0 },
                { ...third, people: 1, active30d: 0 },
            ],
            venn: {
                sets: [{ departmentUuid: PAGE, name: NAME }, other, third],
                regions: [
                    { sets: [PAGE], people: 0, active30d: 0 },
                    { sets: ['other'], people: 4, active30d: 0 },
                    { sets: ['third'], people: 2, active30d: 0 },
                    { sets: [PAGE, 'other'], people: 1, active30d: 0 },
                    { sets: [PAGE, 'third'], people: 1, active30d: 0 },
                    { sets: ['other', 'third'], people: 0, active30d: 0 },
                    { sets: [PAGE, 'other', 'third'], people: 0, active30d: 0 },
                ],
            },
            members: null,
        };
        const { container } = renderWithProviders(
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

        // The drawing's title and its regions' names hold the names as typed, as text
        expect(
            screen.getByRole('group', {
                name: `Overlap of ${NAME}, ${OTHER} and ${THIRD}`,
            }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('button', {
                name: `${NAME} and ${OTHER}, 1 person`,
            }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('img', { name: `${OTHER} only, 4 people` }),
        ).toBeInTheDocument();
        container
            .querySelectorAll('svg title, svg text')
            .forEach((node) => expect(node.children).toHaveLength(0));
        // The key, the list and the person's other department are text
        [NAME, OTHER, THIRD].forEach(expectLiteral);
        expectLiteral(`Also in ${OTHER}`);
        expectNothingInjected();

        await userEvent.click(
            screen.getByRole('button', {
                name: `${THIRD}, 1 person, 0 active`,
            }),
        );
        expect(
            screen.getByRole('button', {
                name: `Clear filter: Also in ${THIRD}`,
            }),
        ).toBeInTheDocument();
        expectLiteral(`Also in ${THIRD}`);
        await userEvent.click(
            screen.getByRole('button', {
                name: `${NAME} and ${OTHER}, 1 person`,
            }),
        );
        expectLiteral(`Also in ${OTHER}, not in ${THIRD}`);
        expectNothingInjected();
    });

    it('in the placement modal rows, chips and pickers', async () => {
        const OTHER = hostile('Other');
        const UNNAMED = hostile('Unnamed');
        hooks.membership = [
            {
                userUuid: 'p1',
                email: EMAIL,
                firstName: PERSON,
                lastName: SURNAME,
                role: OrganizationMemberRole.VIEWER,
                kind: 'shared',
                placements: [
                    {
                        departmentUuid: 'hostile',
                        source: 'group',
                        sourceGroupName: GROUP,
                    },
                    {
                        departmentUuid: 'other',
                        source: 'explicit',
                        sourceGroupName: null,
                    },
                ],
                primaryDepartmentUuid: null,
                countedDepartmentUuids: ['hostile', 'other'],
            },
            {
                userUuid: 'p2',
                email: UNNAMED,
                firstName: '',
                lastName: '',
                role: OrganizationMemberRole.VIEWER,
                kind: 'unassigned',
                placements: [],
                primaryDepartmentUuid: null,
                countedDepartmentUuids: [],
            },
        ];
        const modal = (tab: 'unassigned' | 'shared') => (
            <MembershipModal
                opened
                tab={tab}
                onTabChange={vi.fn()}
                onClose={vi.fn()}
                departments={[
                    hostileDepartment,
                    dept(OTHER, null, 50, { departmentUuid: 'other' }),
                ]}
            />
        );
        // Each picker opens its own list of the departments, named by its visible label
        const expectDepartmentOptions = async (
            picker: string,
            list: string = picker,
        ) => {
            await userEvent.click(
                screen.getByRole('combobox', { name: picker }),
            );
            const options = within(
                await screen.findByRole('listbox', { name: list }),
            );
            expect(
                options.getByRole('option', { name: NAME }),
            ).toBeInTheDocument();
            expect(
                options.getByRole('option', { name: OTHER }),
            ).toBeInTheDocument();
            expectNothingInjected();
        };

        const { rerender } = renderWithProviders(modal('shared'));
        expectLiteral(`${PERSON} ${SURNAME}`);
        expectLiteral(EMAIL);
        // A person in two departments shows each of them as a chip, as text
        expect(
            within(
                screen.getByRole('list', {
                    name: `Departments ${PERSON} ${SURNAME} is in`,
                }),
            )
                .getAllByRole('listitem')
                .map((chip) => chip.textContent),
        ).toEqual([NAME, OTHER]);
        // Where they count is chosen from their departments, named as typed
        await expectDepartmentOptions(
            `Counts in for ${PERSON} ${SURNAME}`,
            'Counts in',
        );

        rerender(modal('unassigned'));
        // Each row's checkbox and select are named for the person; someone with no name, by their email
        expect(
            screen.getByRole('checkbox', { name: `Select ${UNNAMED}` }),
        ).toBeInTheDocument();
        await expectDepartmentOptions(`Department for ${UNNAMED}`);
        // The picker for everyone selected offers the same departments
        await userEvent.click(
            screen.getByRole('checkbox', { name: `Select ${UNNAMED}` }),
        );
        await expectDepartmentOptions('Place selected in');
    });
});
