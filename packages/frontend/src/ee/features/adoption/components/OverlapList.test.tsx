import { type DepartmentOverlap } from '@lightdash/common';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../testing/testUtils';
import { OverlapList } from './OverlapList';

const overlap = (
    name: string,
    people: number,
    active30d: number,
): DepartmentOverlap => ({
    departmentUuid: name.toLowerCase(),
    name,
    people,
    active30d,
});

const OVERLAPS = [
    overlap('Marketing', 1204, 12),
    overlap('Sales', 602, 0),
    overlap('Finance', 1, 1),
];

const renderList = (
    overlaps: DepartmentOverlap[] = OVERLAPS,
    selection: Parameters<typeof OverlapList>[0]['selection'] = null,
) => {
    const onSelect = vi.fn();
    renderWithProviders(
        <OverlapList
            overlaps={overlaps}
            selection={selection}
            onSelect={onSelect}
        />,
    );
    return { onSelect };
};

const rows = () => screen.getAllByRole('button');

// Mantine writes sizes as rem
const remOf = (value: string): number => {
    const match = /([\d.]+)rem/.exec(value);
    if (!match) throw new Error(`No rem in ${value}`);
    return Number(match[1]);
};

describe('OverlapList', () => {
    it('lists each department in the order given, with its people in both and how many are active', () => {
        renderList();
        expect(rows().map((row) => row.getAttribute('aria-label'))).toEqual([
            'Marketing, 1,204 people, 12 active',
            'Sales, 602 people, 0 active',
            'Finance, 1 person, 1 active',
        ]);
        const [marketing] = rows();
        expect(within(marketing).getByText('Marketing')).toBeVisible();
        expect(
            within(marketing).getByText('1,204 people · 12 active'),
        ).toBeVisible();
    });
    it('draws each bar against the largest', () => {
        renderList();
        expect(
            rows().map((row) =>
                row.querySelector('[data-bar]')?.getAttribute('style'),
            ),
        ).toEqual([
            expect.stringContaining('width: 100%'),
            expect.stringContaining('width: 50%'),
            expect.stringMatching(/width: 0\.08\d*%/),
        ]);
    });
    it('chooses the people also in a department', async () => {
        const { onSelect } = renderList();
        await userEvent.click(screen.getByRole('button', { name: /^Sales,/ }));
        expect(onSelect).toHaveBeenCalledExactlyOnceWith({
            withDepartments: [{ departmentUuid: 'sales', name: 'Sales' }],
            withoutDepartments: [],
        });
    });
    it('marks the chosen department, and a second click clears it', async () => {
        const { onSelect } = renderList(OVERLAPS, {
            withDepartments: [{ departmentUuid: 'sales', name: 'Sales' }],
            withoutDepartments: [],
        });
        const sales = screen.getByRole('button', { name: /^Sales,/ });
        expect(sales).toHaveAttribute('aria-pressed', 'true');
        expect(
            screen.getByRole('button', { name: /^Marketing,/ }),
        ).toHaveAttribute('aria-pressed', 'false');
        await userEvent.click(sales);
        expect(onSelect).toHaveBeenCalledExactlyOnceWith(null);
    });
    it('marks no row for a region of the diagram that leaves a department out', () => {
        renderList(OVERLAPS, {
            withDepartments: [{ departmentUuid: 'sales', name: 'Sales' }],
            withoutDepartments: [
                { departmentUuid: 'marketing', name: 'Marketing' },
            ],
        });
        rows().forEach((row) =>
            expect(row).toHaveAttribute('aria-pressed', 'false'),
        );
    });
    it('shows eight rows and scrolls the rest', () => {
        const many = Array.from({ length: 12 }, (_, i) =>
            overlap(`Department ${i}`, 100 - i, 0),
        );
        renderList(many);
        expect(rows()).toHaveLength(12);
        const rowHeight = remOf(rows()[0].style.height);
        const scroller = rows()[0].closest('[data-overlap-scroll]');
        expect(scroller).not.toBeNull();
        expect(
            remOf(
                scroller instanceof HTMLElement ? scroller.style.maxHeight : '',
            ),
        ).toBeCloseTo(rowHeight * 8, 5);
    });
    it('keeps a long name to one line, whole in its title', () => {
        const long =
            'Regional operations and supply planning for the northern stores';
        renderList([overlap(long, 3, 1)]);
        const name = within(rows()[0]).getByText(long);
        expect(name).toHaveAttribute('data-truncate', 'end');
        expect(name).toHaveAttribute('title', long);
    });
});
