import {
    getAncestorUuids,
    getDescendantUuids,
    getParentMap,
    type DepartmentMembership,
    type DepartmentOverlap,
    type DepartmentOverlaps,
    type DepartmentRef,
    type DepartmentVennRegion,
} from '@lightdash/common';
import { type AdoptionSnapshot } from './departmentMetrics';

// The diagram shows the department and at most this many of its largest overlaps
const VENN_OVERLAPS = 2;

type RegionCount = { people: number; active30d: number };

const userUuidsIn = (
    snapshot: AdoptionSnapshot,
    departmentUuid: string,
): Set<string> =>
    new Set(
        (snapshot.rolledMembers.get(departmentUuid) ?? []).map(
            (m) => m.userUuid,
        ),
    );

const byPeopleThenName = (a: DepartmentOverlap, b: DepartmentOverlap) =>
    b.people - a.people ||
    a.name.localeCompare(b.name) ||
    a.departmentUuid.localeCompare(b.departmentUuid);

// Every non-empty combination of the sets, as positions: single sets first, then pairs, then all three
const combinationsOf = (count: number): number[][] => {
    let combinations: number[][] = [[]];
    for (let position = 0; position < count; position += 1) {
        combinations = [
            ...combinations,
            ...combinations.map((combination) => [...combination, position]),
        ];
    }
    return combinations
        .filter((combination) => combination.length > 0)
        .sort((a, b) => a.length - b.length);
};

const buildVenn = (
    snapshot: AdoptionSnapshot,
    department: DepartmentRef,
    largest: DepartmentOverlap[],
): DepartmentOverlaps['venn'] => {
    if (largest.length === 0) return null;
    const sets: DepartmentRef[] = [
        department,
        ...largest.map(({ departmentUuid, name }) => ({
            departmentUuid,
            name,
        })),
    ];
    const people = sets.map((set) => userUuidsIn(snapshot, set.departmentUuid));
    const everyone = new Set<string>();
    people.forEach((set) => set.forEach((userUuid) => everyone.add(userUuid)));
    // A person's region is the exact combination of sets that holds them, so each is in one only
    const counts = new Map<string, RegionCount>();
    everyone.forEach((userUuid) => {
        const key = people
            .flatMap((set, position) => (set.has(userUuid) ? [position] : []))
            .join(',');
        const count = counts.get(key) ?? { people: 0, active30d: 0 };
        count.people += 1;
        if (snapshot.activeUserUuids.has(userUuid)) count.active30d += 1;
        counts.set(key, count);
    });
    return {
        sets,
        regions: combinationsOf(sets.length).map(
            (positions): DepartmentVennRegion => {
                const count = counts.get(positions.join(','));
                return {
                    sets: positions.map(
                        (position) => sets[position].departmentUuid,
                    ),
                    people: count?.people ?? 0,
                    active30d: count?.active30d ?? 0,
                };
            },
        ),
    };
};

// Departments in other branches that people counted here also count in, rolled up
export const computeDepartmentOverlaps = (
    snapshot: AdoptionSnapshot,
    departmentUuid: string,
): Pick<DepartmentOverlaps, 'overlaps' | 'venn'> => {
    const { departments } = snapshot.summary;
    const own = userUuidsIn(snapshot, departmentUuid);
    if (own.size === 0) return { overlaps: [], venn: null };
    // Departments above and below always hold its people, so they are not overlaps
    const related = new Set([
        departmentUuid,
        ...getAncestorUuids(departmentUuid, getParentMap(departments)),
        ...getDescendantUuids(departmentUuid, departments),
    ]);
    const overlaps = departments
        .flatMap((other): DepartmentOverlap[] => {
            if (related.has(other.departmentUuid)) return [];
            const count: RegionCount = { people: 0, active30d: 0 };
            (snapshot.rolledMembers.get(other.departmentUuid) ?? []).forEach(
                ({ userUuid }) => {
                    if (!own.has(userUuid)) return;
                    count.people += 1;
                    if (snapshot.activeUserUuids.has(userUuid)) {
                        count.active30d += 1;
                    }
                },
            );
            return count.people === 0
                ? []
                : [
                      {
                          departmentUuid: other.departmentUuid,
                          name: other.name,
                          ...count,
                      },
                  ];
        })
        .sort(byPeopleThenName);
    const name =
        departments.find((d) => d.departmentUuid === departmentUuid)?.name ??
        '';
    return {
        overlaps,
        venn: buildVenn(
            snapshot,
            { departmentUuid, name },
            overlaps.slice(0, VENN_OVERLAPS),
        ),
    };
};

// People counted, rolled up, in the department and in every one of the others
export const getSharedMembers = (
    snapshot: AdoptionSnapshot,
    departmentUuid: string,
    otherUuids: string[],
): DepartmentMembership[] => {
    const others = otherUuids.map((uuid) => userUuidsIn(snapshot, uuid));
    return (snapshot.rolledMembers.get(departmentUuid) ?? []).filter(
        ({ userUuid }) => others.every((set) => set.has(userUuid)),
    );
};
