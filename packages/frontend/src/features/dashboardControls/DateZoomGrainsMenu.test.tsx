import { DateGranularity, type DateZoomControl } from '@lightdash/common';
import { Menu } from '@mantine/core';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../testing/testUtils';
import { DateZoomGrainsMenu } from './DateZoomGrainsMenu';

type NamedZoom = Pick<DateZoomControl, 'uuid' | 'name' | 'granularity'>;

const customLabels = {
    retail_week: 'Retail week',
    fiscal_quarter: 'Fiscal quarter',
};
const enabled = [DateGranularity.WEEK, DateGranularity.MONTH, 'fiscal_quarter'];

const render = ({
    enabledGranularities = enabled,
    defaultGranularity = DateGranularity.MONTH as string | null,
    namedZooms = [] as NamedZoom[],
} = {}) => {
    const onChange = vi.fn();
    renderWithProviders(
        <Menu opened>
            <Menu.Target>
                <button type="button">Open</button>
            </Menu.Target>
            <Menu.Dropdown>
                <DateZoomGrainsMenu
                    enabledGranularities={enabledGranularities}
                    customLabels={customLabels}
                    defaultGranularity={defaultGranularity}
                    namedZooms={namedZooms}
                    onChange={onChange}
                />
            </Menu.Dropdown>
        </Menu>,
    );
    return { onChange };
};

const item = (name: string | RegExp) => screen.getByRole('menuitem', { name });

// A locked item is disabled; its wrapper takes the hover for the tooltip
const hoverItem = (menuItem: HTMLElement) =>
    userEvent.hover(menuItem.parentElement ?? menuItem);

const zooms = (names: string[]): NamedZoom[] =>
    names.map((name, index) => ({
        uuid: `z${index}`,
        name,
        granularity: DateGranularity.WEEK,
    }));

describe('DateZoomGrainsMenu', () => {
    it('says it is for every zoom and lists standard, then custom grains', () => {
        render();
        expect(
            screen.getByText('For every date zoom on this dashboard'),
        ).toBeInTheDocument();
        expect(
            screen
                .getAllByRole('menuitem')
                .map((menuItem) => menuItem.textContent),
        ).toEqual([
            'Second',
            'Minute',
            'Hour',
            'Day',
            'Week',
            'MonthDefault',
            'Quarter',
            'Year',
            'Fiscal quarter',
            'Retail week',
        ]);
        expect(screen.getByText('Custom')).toBeInTheDocument();
    });

    it('calls back on each toggle, in order', async () => {
        const { onChange } = render();
        await userEvent.click(item('Day'));
        expect(onChange).toHaveBeenLastCalledWith(
            [
                DateGranularity.DAY,
                DateGranularity.WEEK,
                DateGranularity.MONTH,
                'fiscal_quarter',
            ],
            DateGranularity.MONTH,
        );
        await userEvent.click(item('Retail week'));
        expect(onChange).toHaveBeenLastCalledWith(
            [...enabled, 'retail_week'],
            DateGranularity.MONTH,
        );
        expect(onChange).toHaveBeenCalledTimes(2);
    });

    it('clears the default when its grain is unchecked', async () => {
        const { onChange } = render();
        expect(item(/^Month/)).toHaveTextContent('Default');
        await userEvent.click(item(/^Month/));
        expect(onChange).toHaveBeenCalledWith(
            [DateGranularity.WEEK, 'fiscal_quarter'],
            null,
        );
    });

    it('keeps the last enabled grain checked', async () => {
        render({
            enabledGranularities: [DateGranularity.WEEK],
            defaultGranularity: null,
        });
        expect(item('Week')).toBeDisabled();
        await hoverItem(item('Week'));
        expect(await screen.findByRole('tooltip')).toHaveTextContent(
            'Viewers need at least one grain',
        );
    });

    it.each([
        [['Revenue zoom'], 'Used by Revenue zoom'],
        [['Revenue zoom', 'Orders zoom'], 'Used by 2 date zooms'],
        [
            ['Revenue zoom', 'Orders zoom', 'Payments zoom'],
            'Used by 3 date zooms',
        ],
    ])('locks a grain in use by %j, saying who', async (names, reason) => {
        render({ namedZooms: zooms(names) });
        expect(item('Week')).toBeDisabled();
        expect(item(/^Month/)).toBeEnabled();
        await hoverItem(item('Week'));
        expect(await screen.findByRole('tooltip')).toHaveTextContent(reason);
    });

    it('names the zoom over the last-grain reason when both apply', async () => {
        render({
            enabledGranularities: [DateGranularity.WEEK],
            defaultGranularity: null,
            namedZooms: zooms(['Revenue zoom']),
        });
        await hoverItem(item('Week'));
        expect(await screen.findByRole('tooltip')).toHaveTextContent(
            'Used by Revenue zoom',
        );
    });
});
