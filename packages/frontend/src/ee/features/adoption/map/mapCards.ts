import { type DepartmentWithMetrics } from '@lightdash/common';

export type MapCard = {
    key: 'biggestGap' | 'furthestBehind' | 'seatsUnused' | 'unplaced';
    title: string;
    value: string;
    detail: string;
    departmentUuid: string | null;
};

type Ranked = { department: DepartmentWithMetrics; score: number };

const top = (
    departments: DepartmentWithMetrics[],
    score: (department: DepartmentWithMetrics) => number | null,
): Ranked | null =>
    departments.reduce<Ranked | null>((best, department) => {
        const value = score(department);
        if (value === null || value <= 0) return best;
        return best === null || value > best.score
            ? { department, score: value }
            : best;
    }, null);

const people = (count: number): string =>
    `${count} ${count === 1 ? 'person' : 'people'}`;

export const computeMapCards = (
    departments: DepartmentWithMetrics[],
    attention: { conflictCount: number; unassignedCount: number },
): MapCard[] => {
    const gap = top(departments, (d) =>
        d.effectiveHeadcount === null
            ? null
            : d.effectiveHeadcount - d.metrics.activeCount30d,
    );
    const withTargets = departments.filter((d) => d.targetActiveUsers !== null);
    const behind = top(withTargets, (d) =>
        d.targetActiveUsers === null
            ? null
            : d.targetActiveUsers - d.metrics.activeCount30d,
    );
    const unused = top(
        departments,
        (d) => d.metrics.memberCount - d.metrics.activeCount30d,
    );
    const unplaced = attention.conflictCount + attention.unassignedCount;
    const hasHeadcount = departments.some((d) => d.effectiveHeadcount !== null);

    const gapCard: MapCard = gap
        ? {
              key: 'biggestGap',
              title: 'Biggest gap',
              value: people(gap.score),
              detail: `${gap.department.name}: ${gap.department.metrics.activeCount30d} of ${gap.department.effectiveHeadcount} active`,
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
              value: `${behind.score} short`,
              detail: `${behind.department.name}: ${behind.department.metrics.activeCount30d} of ${behind.department.targetActiveUsers} target`,
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
              value: `${unused.score} idle`,
              detail: `${unused.department.name}: on Lightdash but not active in 30 days`,
              departmentUuid: unused.department.departmentUuid,
          }
        : {
              key: 'seatsUnused',
              title: 'Most seats unused',
              value: '–',
              detail: 'Everyone with an account is active',
              departmentUuid: null,
          };

    return [
        gapCard,
        behindCard,
        unusedCard,
        {
            key: 'unplaced',
            title: 'Unplaced people',
            value: people(unplaced),
            detail:
                unplaced === 0
                    ? 'Everyone is placed'
                    : 'In no department or in more than one',
            departmentUuid: null,
        },
    ];
};
