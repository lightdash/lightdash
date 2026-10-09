import { getChildrenMap, type DepartmentWithMetrics } from '@lightdash/common';
import { countBucketPeople, type PeopleBucket } from '../map/geometry';
import { getMissingHeadcountWord } from '../utils/departmentRows';
import { formatCount } from '../utils/format';
import { getDirectHeadcount } from '../utils/headcount';

// One part of a department's block: a sub-department with everyone below it, the people directly in the department
// beside its sub-departments ("Directly in" it), or the whole of a department without sub-departments
export type WafflePart = {
    id: string;
    // The department the part stands for: the sub-department, or the block's own department
    departmentUuid: string;
    people: PeopleBucket;
    // One square per person: the effective headcount, or for the people directly in a department its residual
    size: number;
} & (
    | { kind: 'department' | 'direct'; name: string }
    | { kind: 'own'; name: null }
);

export type WaffleBlockData = {
    departmentUuid: string;
    name: string;
    size: number;
    memberCount: number;
    activeCount: number;
    // Null without a headcount, where the size is only the people on Lightdash
    headcount: number | null;
    parts: WafflePart[];
};

// Largest first, then by name, so the order never depends on the order departments arrive in
const byHeadcount = (
    a: DepartmentWithMetrics,
    b: DepartmentWithMetrics,
): number =>
    b.effectiveHeadcount - a.effectiveHeadcount ||
    a.name.localeCompare(b.name) ||
    a.departmentUuid.localeCompare(b.departmentUuid);

const getBucket = (department: DepartmentWithMetrics): PeopleBucket => ({
    metrics: department.metrics,
    headcount: department.hasHeadcount ? department.effectiveHeadcount : null,
});

// One block per top-level department, its parts the sub-departments then the people directly in it over its residual,
// so the parts hold its whole effective headcount and nobody is drawn twice
export const buildWaffleBlocks = (
    departments: DepartmentWithMetrics[],
): WaffleBlockData[] => {
    const children = getChildrenMap(departments);
    const byUuid = new Map(departments.map((d) => [d.departmentUuid, d]));
    const lookup = (uuids: string[] | undefined): DepartmentWithMetrics[] =>
        (uuids ?? []).flatMap((uuid) => {
            const department = byUuid.get(uuid);
            return department ? [department] : [];
        });

    const getParts = (top: DepartmentWithMetrics): WafflePart[] => {
        const subDepartments = lookup(children.get(top.departmentUuid)).sort(
            byHeadcount,
        );
        if (subDepartments.length === 0) {
            const people = getBucket(top);
            return [
                {
                    id: `own:${top.departmentUuid}`,
                    kind: 'own',
                    departmentUuid: top.departmentUuid,
                    name: null,
                    people,
                    size: countBucketPeople(people),
                },
            ];
        }
        const parts = subDepartments.map((child): WafflePart => {
            const people = getBucket(child);
            return {
                id: child.departmentUuid,
                kind: 'department',
                departmentUuid: child.departmentUuid,
                name: child.name,
                people,
                size: countBucketPeople(people),
            };
        });
        const residual = getDirectHeadcount(top, subDepartments);
        if (residual <= 0) return parts;
        return [
            ...parts,
            {
                id: `own:${top.departmentUuid}`,
                kind: 'direct',
                departmentUuid: top.departmentUuid,
                name: `Directly in ${top.name}`,
                // Without a headcount anywhere in the department the residual is only its people, so none is quoted
                people: {
                    metrics: top.directMetrics,
                    headcount: top.hasHeadcount ? residual : null,
                },
                size: residual,
            },
        ];
    };

    return lookup(children.get(null))
        .sort(byHeadcount)
        .map(
            (top): WaffleBlockData => ({
                departmentUuid: top.departmentUuid,
                name: top.name,
                size: top.effectiveHeadcount,
                memberCount: top.metrics.memberCount,
                activeCount: top.metrics.activeCount30d,
                headcount: top.hasHeadcount ? top.effectiveHeadcount : null,
                parts: getParts(top),
            }),
        );
};

// "834 of 1,900", or without a headcount "14 on Lightdash"
const formatPeople = (members: number, headcount: number | null): string =>
    headcount === null
        ? `${formatCount(members)} on Lightdash`
        : `${formatCount(members)} of ${formatCount(headcount)}`;

// A block's counts line, and the second line of every tooltip: "834 of 1,900 · 495 active". Without a headcount
// anywhere in the department it asks for one instead, as the panel does: "14 on Lightdash · Add headcount"
export const formatCounts = (
    members: number,
    headcount: number | null,
    active: number,
    canManage: boolean,
): string =>
    `${formatPeople(members, headcount)} · ${headcount === null ? getMissingHeadcountWord(canManage) : `${formatCount(active)} active`}`;

// A part's label: "Sales · 420 of 760"
export const formatPartLabel = (
    part: Extract<WafflePart, { name: string }>,
): string =>
    `${part.name} · ${formatPeople(part.people.metrics.memberCount, part.people.headcount)}`;

// What a screen reader hears for a block or a part: "Sales, 420 of 760 on Lightdash, 252 active", ending
// "no headcount set" as the map's descriptions do where there is none
export const describeCounts = (
    name: string,
    members: number,
    headcount: number | null,
    active: number,
): string =>
    headcount === null
        ? `${name}, ${formatPeople(members, headcount)}, ${formatCount(active)} active, no headcount set`
        : `${name}, ${formatPeople(members, headcount)} on Lightdash, ${formatCount(active)} active`;
