import { describe, expect, it } from 'vitest';
import { countBucketPeople } from '../map/geometry';
import {
    deepOrganization,
    flatOrganization,
} from '../map/organizationFixtures';
import {
    dept,
    metricsFixture,
    seededOrganization,
} from '../utils/adoptionFixtures';
import {
    buildWaffleBlocks,
    describeCounts,
    formatCounts,
    formatPartLabel,
} from './waffleBlocks';

const sum = (values: number[]) => values.reduce((total, v) => total + v, 0);

describe('buildWaffleBlocks', () => {
    it('makes one block per top-level department, largest first', () => {
        expect(
            buildWaffleBlocks(deepOrganization).map((block) => [
                block.name,
                block.size,
            ]),
        ).toEqual([
            ['Operations', 2350],
            ['Commercial', 1900],
            ['Product & Engineering', 650],
            ['Finance', 420],
            ['People', 125],
            ['Data & Analytics', 70],
            ['Legal & Compliance', 60],
            ['Executive Office', 12],
        ]);
    });

    it('stacks the sub-departments largest first, then the people directly in the department over its residual', () => {
        const operations = buildWaffleBlocks(deepOrganization)[0];
        expect(
            operations.parts.map((part) => [part.kind, part.name, part.size]),
        ).toEqual([
            ['department', 'Supply Chain', 1750],
            ['department', 'Facilities', 120],
            ['department', 'Quality', 90],
            ['department', 'Health & Safety', 45],
            ['direct', 'Directly in Operations', 345],
        ]);
        // A sub-department's part holds everyone below it, and selects that sub-department
        const supplyChain = operations.parts[0];
        expect(supplyChain.departmentUuid).toBe('Supply Chain');
        expect(supplyChain.people.metrics.memberCount).toBe(170);
        // The people directly in a department select the department itself
        expect(operations.parts[4].departmentUuid).toBe('Operations');
        expect(operations.parts[4].people.metrics.memberCount).toBe(2);
    });

    it.each([
        ['6,000-headcount', deepOrganization],
        ['enterprise-shaped', flatOrganization],
        ['small', seededOrganization()],
    ])(
        "draws everyone in the %s organization once: a block's parts add up to its headcount and its people",
        (_, departments) => {
            buildWaffleBlocks(departments).forEach((block) => {
                expect(sum(block.parts.map((part) => part.size))).toBe(
                    block.size,
                );
                expect(
                    sum(
                        block.parts.map(
                            (part) => part.people.metrics.memberCount,
                        ),
                    ),
                ).toBe(block.memberCount);
                expect(
                    sum(
                        block.parts.map(
                            (part) => part.people.metrics.activeCount30d,
                        ),
                    ),
                ).toBe(block.activeCount);
                block.parts.forEach((part) =>
                    expect(part.size).toBe(countBucketPeople(part.people)),
                );
            });
        },
    );

    it('gives a department without sub-departments one part of all its people, with no name of its own', () => {
        const executive = buildWaffleBlocks(deepOrganization).find(
            (block) => block.name === 'Executive Office',
        );
        expect(executive?.parts).toEqual([
            expect.objectContaining({
                kind: 'own',
                departmentUuid: 'Executive Office',
                name: null,
                size: 12,
            }),
        ]);
    });

    it('leaves out the people directly in a department when it keeps no headcount for them', () => {
        const people = buildWaffleBlocks(deepOrganization).find(
            (block) => block.name === 'People',
        );
        expect(people?.parts.map((part) => part.kind)).toEqual([
            'department',
            'department',
            'department',
            'department',
        ]);
    });

    it('keeps a department without a headcount without one, sized by its people on Lightdash', () => {
        const [product] = buildWaffleBlocks(
            seededOrganization().filter(
                (department) => department.name === 'Product',
            ),
        );
        expect(product.headcount).toBeNull();
        expect(product.parts[0].people.headcount).toBeNull();
        expect(product.size).toBe(1);
    });

    it('ignores a department whose parent is missing by putting it at the top', () => {
        const blocks = buildWaffleBlocks([
            dept('Orphan', 'gone', null, {
                headcount: 5,
                effectiveHeadcount: 5,
                hasHeadcount: true,
                metrics: metricsFixture(2, 40),
            }),
        ]);
        expect(blocks.map((block) => block.name)).toEqual(['Orphan']);
    });
});

describe('waffle wording', () => {
    it('writes the counts line with thousands separators', () => {
        expect(formatCounts(834, 1900, 495)).toBe('834 of 1,900 · 495 active');
        expect(formatCounts(14, null, 10)).toBe('14 on Lightdash · 10 active');
    });

    it('labels a part with its name and how many of its headcount are on Lightdash', () => {
        const operations = buildWaffleBlocks(deepOrganization)[0];
        expect(
            operations.parts.map((part) =>
                formatPartLabel(part.name ?? operations.name, part),
            ),
        ).toEqual([
            'Supply Chain · 170 of 1,750',
            'Facilities · 12 of 120',
            'Quality · 29 of 90',
            'Health & Safety · 8 of 45',
            'Directly in Operations · 2 of 345',
        ]);
    });

    it('describes a block or a part in words for screen readers', () => {
        expect(describeCounts('Sales', 420, 760, 252)).toBe(
            'Sales, 420 of 760 on Lightdash, 252 active',
        );
        expect(describeCounts('Product', 1, null, 1)).toBe(
            'Product, 1 on Lightdash, 1 active',
        );
    });
});
