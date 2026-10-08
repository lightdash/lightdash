import {
    getAncestorUuids,
    getChildrenMap,
    getDescendantUuids,
    getParentMap,
    type DepartmentWithMetrics,
} from '@lightdash/common';
import { formatCount, formatQuantity, PEOPLE } from '../utils/format';

export type MapCard = {
    key: 'biggestGap' | 'furthestBehind' | 'seatsUnused' | 'unplaced';
    title: string;
    value: string;
    detail: string;
    departmentUuid: string | null;
};

// A department and how a card names it: its path from the level shown when it sits further down
type Entry = { department: DepartmentWithMetrics; label: string };
type Ranked = Entry & { score: number };

// The highest score wins and a tie goes to the name that comes first
const top = (
    entries: Entry[],
    score: (department: DepartmentWithMetrics) => number | null,
): Ranked | null =>
    entries.reduce<Ranked | null>((best, entry) => {
        const value = score(entry.department);
        if (value === null || value <= 0) return best;
        const isBetter =
            best === null ||
            value > best.score ||
            (value === best.score &&
                entry.department.name.localeCompare(best.department.name) < 0);
        return isBetter ? { ...entry, score: value } : best;
    }, null);

// The departments one level below the focus, and every department at or below that level.
// A department without sub-departments is compared with itself.
const getEntries = (
    departments: DepartmentWithMetrics[],
    focusUuid: string | null,
): { level: Entry[]; below: Entry[] } => {
    const byUuid = new Map(departments.map((d) => [d.departmentUuid, d]));
    const focus = focusUuid === null ? null : (byUuid.get(focusUuid) ?? null);
    const lookup = (uuids: string[]): DepartmentWithMetrics[] =>
        uuids.flatMap((uuid) => {
            const department = byUuid.get(uuid);
            return department ? [department] : [];
        });
    const levelUuids =
        getChildrenMap(departments).get(focus?.departmentUuid ?? null) ?? [];
    if (focus !== null && levelUuids.length === 0) {
        const itself = [{ department: focus, label: focus.name }];
        return { level: itself, below: itself };
    }
    const parentMap = getParentMap(departments);
    const pathTo = (department: DepartmentWithMetrics): string => {
        const ancestors = getAncestorUuids(
            department.departmentUuid,
            parentMap,
        );
        const end =
            focus === null ? -1 : ancestors.indexOf(focus.departmentUuid);
        const above = end < 0 ? ancestors : ancestors.slice(0, end);
        return [...lookup(above).reverse(), department]
            .map((each) => each.name)
            .join(' / ');
    };
    return {
        level: lookup(levelUuids).map((department) => ({
            department,
            label: department.name,
        })),
        below: (focus === null
            ? departments
            : lookup(getDescendantUuids(focus.departmentUuid, departments))
        ).map((department) => ({ department, label: pathTo(department) })),
    };
};

export const computeMapCards = (
    departments: DepartmentWithMetrics[],
    focusUuid: string | null,
    attention: { conflictCount: number; unassignedCount: number },
): MapCard[] => {
    const { level, below } = getEntries(departments, focusUuid);
    // A parent's numbers include its children's, so the gap is only compared across one level
    const gap = top(level, (d) =>
        d.effectiveHeadcount === null
            ? null
            : d.effectiveHeadcount - d.metrics.activeCount30d,
    );
    const withTargets = below.filter(
        ({ department }) => department.targetActiveUsers !== null,
    );
    const behind = top(withTargets, (d) =>
        d.targetActiveUsers === null
            ? null
            : d.targetActiveUsers - d.metrics.activeCount30d,
    );
    const unused = top(
        below,
        (d) => d.metrics.memberCount - d.metrics.activeCount30d,
    );
    const unplaced = attention.conflictCount + attention.unassignedCount;
    // With nobody on Lightdash in view there is no seat to leave unused
    const focus =
        departments.find(
            (department) => department.departmentUuid === focusUuid,
        ) ?? null;
    const hasAccounts = (focus === null ? departments : [focus]).some(
        (department) => department.metrics.memberCount > 0,
    );
    const hasHeadcount = level.some(
        ({ department }) => department.effectiveHeadcount !== null,
    );

    const gapCard: MapCard = gap
        ? {
              key: 'biggestGap',
              title: 'Biggest gap',
              value: formatQuantity(gap.score, PEOPLE),
              detail: `${gap.label}: ${formatCount(gap.department.metrics.activeCount30d)} of ${formatCount(gap.department.effectiveHeadcount ?? 0)} active`,
              departmentUuid: gap.department.departmentUuid,
          }
        : {
              key: 'biggestGap',
              title: 'Biggest gap',
              value: '–',
              detail: hasHeadcount
                  ? 'Everyone in headcount is active'
                  : 'Add headcount to see gaps',
              departmentUuid: null,
          };

    const noBehindDetail =
        withTargets.length === 0 ? 'No targets set' : 'Every target is met';
    const behindCard: MapCard = behind
        ? {
              key: 'furthestBehind',
              title: 'Furthest behind',
              value: `${formatCount(behind.score)} short`,
              detail: `${behind.label}: ${formatCount(behind.department.metrics.activeCount30d)} of ${formatCount(behind.department.targetActiveUsers ?? 0)} target`,
              departmentUuid: behind.department.departmentUuid,
          }
        : {
              key: 'furthestBehind',
              title: 'Furthest behind',
              value: '–',
              detail: noBehindDetail,
              departmentUuid: null,
          };

    const unusedCard: MapCard = unused
        ? {
              key: 'seatsUnused',
              title: 'Most seats unused',
              value: `${formatCount(unused.score)} idle`,
              detail: `${unused.label}: on Lightdash but not active in 30 days`,
              departmentUuid: unused.department.departmentUuid,
          }
        : {
              key: 'seatsUnused',
              title: 'Most seats unused',
              value: '–',
              detail: hasAccounts
                  ? 'Everyone with an account is active'
                  : 'Nobody on Lightdash yet',
              departmentUuid: null,
          };

    return [
        gapCard,
        behindCard,
        unusedCard,
        {
            key: 'unplaced',
            title: 'Unplaced people',
            value: formatQuantity(unplaced, PEOPLE),
            detail:
                unplaced === 0
                    ? 'Everyone is placed'
                    : 'In no department or in more than one',
            departmentUuid: null,
        },
    ];
};
