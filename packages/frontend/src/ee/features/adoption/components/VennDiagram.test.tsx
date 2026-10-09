import { type DepartmentOverlaps } from '@lightdash/common';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../testing/testUtils';
import { getVennLayout } from '../utils/vennGeometry';
import { VennDiagram } from './VennDiagram';

type Venn = NonNullable<DepartmentOverlaps['venn']>;

const DATA = { departmentUuid: 'data', name: 'Data' };
const MARKETING = { departmentUuid: 'marketing', name: 'Marketing' };
const SALES = { departmentUuid: 'sales', name: 'Sales' };

const region = (sets: string[], people: number) => ({
    sets,
    people,
    active30d: 0,
});

const threeSets = (triple = 5): Venn => ({
    sets: [DATA, MARKETING, SALES],
    regions: [
        region(['data'], 1234),
        region(['marketing'], 2000),
        region(['sales'], 300),
        region(['data', 'marketing'], 42),
        region(['data', 'sales'], 7),
        region(['marketing', 'sales'], 15),
        region(['data', 'marketing', 'sales'], triple),
    ],
});

const twoSets: Venn = {
    sets: [DATA, MARKETING],
    regions: [
        region(['data'], 12),
        region(['marketing'], 40),
        region(['data', 'marketing'], 3),
    ],
};

const renderVenn = (
    venn: Venn,
    selection: Parameters<typeof VennDiagram>[0]['selection'] = null,
) => {
    const onSelect = vi.fn();
    const view = renderWithProviders(
        <VennDiagram
            departmentUuid="data"
            venn={venn}
            selection={selection}
            onSelect={onSelect}
        />,
    );
    return { ...view, onSelect };
};

const regionButtons = () =>
    screen
        .getAllByRole('button')
        .map((button) => button.getAttribute('aria-label'));

describe('VennDiagram', () => {
    it('draws the department and its two largest overlaps as three circles of one size, with each region counted', () => {
        const { container } = renderVenn(threeSets());
        const circles = screen
            .getByRole('group')
            .querySelectorAll('circle[data-set]');
        expect(circles).toHaveLength(3);
        expect(
            new Set(Array.from(circles, (c) => c.getAttribute('r'))).size,
        ).toBe(1);
        expect(
            Array.from(container.querySelectorAll('svg text'), (text) => [
                text.textContent,
                text.getAttribute('aria-hidden'),
            ]),
        ).toEqual(
            ['1,234', '2,000', '300', '42', '7', '15', '5'].map((count) => [
                count,
                'true',
            ]),
        );
    });
    it('puts each count at the centre of its region', () => {
        const { container } = renderVenn(threeSets());
        const labels = getVennLayout(3).regions.map(({ label }) => [
            String(label.x),
            String(label.y),
        ]);
        expect(
            Array.from(container.querySelectorAll('svg text'), (text) => [
                text.getAttribute('x'),
                text.getAttribute('y'),
            ]),
        ).toEqual(labels);
    });
    it('draws two circles when there is one overlap', () => {
        renderVenn(twoSets);
        expect(
            screen.getByRole('group').querySelectorAll('circle[data-set]'),
        ).toHaveLength(2);
        expect(regionButtons()).toEqual([
            'Data only, 12 people',
            'Data and Marketing, 3 people',
        ]);
        expect(
            screen.getByRole('img', { name: 'Marketing only, 40 people' }),
        ).toBeInTheDocument();
    });
    it('is titled for assistive technology, with the title inside the drawing', () => {
        renderVenn(threeSets());
        const drawing = screen.getByRole('group', {
            name: 'Overlap of Data, Marketing and Sales',
        });
        expect(drawing.querySelector(':scope > title')).toHaveTextContent(
            'Overlap of Data, Marketing and Sales',
        );
    });
    it('offers every region holding the department as a button named by its departments and count', () => {
        renderVenn(threeSets());
        expect(regionButtons()).toEqual([
            'Data only, 1,234 people',
            'Data and Marketing, 42 people',
            'Data and Sales, 7 people',
            'Data, Marketing and Sales, 5 people',
        ]);
    });
    it('mutes the regions outside the department, which are counts only', async () => {
        const { onSelect } = renderVenn(threeSets());
        const outside = [
            'Marketing only, 2,000 people',
            'Sales only, 300 people',
            'Marketing and Sales, 15 people',
        ].map((name) => screen.getByRole('img', { name }));
        outside.forEach((element) => {
            expect(element).toHaveAttribute('data-muted');
            expect(element).not.toHaveAttribute('tabindex');
        });
        await userEvent.click(outside[0]);
        expect(onSelect).not.toHaveBeenCalled();
    });
    it('lists exactly the people of the region chosen', async () => {
        const { onSelect } = renderVenn(threeSets());
        await userEvent.click(
            screen.getByRole('button', {
                name: 'Data and Marketing, 42 people',
            }),
        );
        expect(onSelect).toHaveBeenLastCalledWith({
            withDepartments: [MARKETING],
            withoutDepartments: [SALES],
        });
        await userEvent.click(
            screen.getByRole('button', { name: 'Data only, 1,234 people' }),
        );
        expect(onSelect).toHaveBeenLastCalledWith({
            withDepartments: [],
            withoutDepartments: [MARKETING, SALES],
        });
        await userEvent.click(
            screen.getByRole('button', {
                name: 'Data, Marketing and Sales, 5 people',
            }),
        );
        expect(onSelect).toHaveBeenLastCalledWith({
            withDepartments: [MARKETING, SALES],
            withoutDepartments: [],
        });
    });
    it('chooses a region from the keyboard', async () => {
        const { onSelect } = renderVenn(threeSets());
        await userEvent.tab();
        expect(
            screen.getByRole('button', { name: 'Data only, 1,234 people' }),
        ).toHaveFocus();
        await userEvent.keyboard('{Enter}');
        expect(onSelect).toHaveBeenLastCalledWith({
            withDepartments: [],
            withoutDepartments: [MARKETING, SALES],
        });
        await userEvent.tab();
        await userEvent.keyboard(' ');
        expect(onSelect).toHaveBeenLastCalledWith({
            withDepartments: [MARKETING],
            withoutDepartments: [SALES],
        });
        expect(onSelect).toHaveBeenCalledTimes(2);
    });
    it('marks the chosen region, and a second click clears it', async () => {
        const { onSelect } = renderVenn(threeSets(), {
            withDepartments: [SALES],
            withoutDepartments: [MARKETING],
        });
        const chosen = screen.getByRole('button', {
            name: 'Data and Sales, 7 people',
        });
        expect(chosen).toHaveAttribute('aria-pressed', 'true');
        expect(
            screen.getByRole('button', { name: 'Data only, 1,234 people' }),
        ).toHaveAttribute('aria-pressed', 'false');
        await userEvent.click(chosen);
        expect(onSelect).toHaveBeenLastCalledWith(null);
    });
    it('does not offer a region with nobody in it', () => {
        renderVenn(threeSets(0));
        expect(
            screen.queryByRole('button', {
                name: 'Data, Marketing and Sales, 0 people',
            }),
        ).not.toBeInTheDocument();
        expect(
            screen.getByRole('img', {
                name: 'Data, Marketing and Sales, 0 people',
            }),
        ).toHaveAttribute('data-muted');
    });
    it('names each circle in a key under the drawing', () => {
        renderVenn(threeSets());
        expect(
            screen
                .getAllByRole('listitem')
                .map((item) => [
                    item.textContent,
                    item.querySelector('[data-set]')?.getAttribute('data-set'),
                ]),
        ).toEqual([
            ['Data', '0'],
            ['Marketing', '1'],
            ['Sales', '2'],
        ]);
    });
    it('draws the department first whatever order the sets come in', () => {
        renderVenn({ ...threeSets(), sets: [SALES, DATA, MARKETING] });
        expect(
            screen.getAllByRole('listitem').map((item) => item.textContent),
        ).toEqual(['Data', 'Sales', 'Marketing']);
        expect(regionButtons()).toEqual([
            'Data only, 1,234 people',
            'Data and Sales, 7 people',
            'Data and Marketing, 42 people',
            'Data, Sales and Marketing, 5 people',
        ]);
    });
    it('draws nothing it cannot draw truthfully', () => {
        const { container } = renderVenn({
            sets: [MARKETING, SALES],
            regions: [],
        });
        expect(container.querySelector('svg')).toBeNull();
    });
});
