import { DateGranularity, type DateZoomControl } from '@lightdash/common';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../testing/testUtils';
import { DefaultZoomPopover } from './DefaultZoomPopover';
import { type EditorView } from './FilterPopover';

const customLabels = {
    retail_week: 'Retail week',
    fiscal_quarter: 'Fiscal quarter',
};
const enabled = [DateGranularity.WEEK, DateGranularity.MONTH, 'fiscal_quarter'];

const renderEditor = ({
    enabledGranularities = enabled,
    defaultGranularity = DateGranularity.MONTH as string | null,
    initialView = 'value' as EditorView,
    namedZooms = [] as Pick<DateZoomControl, 'uuid' | 'name' | 'granularity'>[],
} = {}) => {
    const onApply = vi.fn();
    renderWithProviders(
        <DefaultZoomPopover
            enabledGranularities={enabledGranularities}
            defaultGranularity={defaultGranularity}
            customLabels={customLabels}
            mode={{
                kind: 'editor',
                tileCount: 3,
                namedZooms,
                initialView,
                onApply,
            }}
            onCancel={vi.fn()}
        />,
    );
    return { onApply };
};

const renderViewer = (defaultGranularity: string | null) => {
    const onApply = vi.fn();
    renderWithProviders(
        <DefaultZoomPopover
            enabledGranularities={enabled}
            defaultGranularity={defaultGranularity}
            customLabels={customLabels}
            mode={{ kind: 'viewer', granularity: null, onApply }}
            onCancel={vi.fn()}
        />,
    );
    return { onApply };
};

describe('DefaultZoomPopover', () => {
    it('clears the default to none', async () => {
        const { onApply } = renderEditor();
        const grain = screen.getByRole('combobox', { name: 'Default zoom' });
        expect(grain).toHaveValue('Month');
        expect(grain).toHaveFocus();
        expect(screen.getByText('Zooms the other 3 tiles')).toBeInTheDocument();
        expect(
            screen.getByText('If cleared, tiles keep their own grain.'),
        ).toBeInTheDocument();
        await userEvent.click(
            screen.getByRole('button', { name: 'Clear grain' }),
        );
        expect(grain).toHaveAttribute('placeholder', 'None');
        await userEvent.click(screen.getByRole('button', { name: 'Apply' }));
        expect(onApply).toHaveBeenCalledWith({
            enabledGranularities: enabled,
            defaultGranularity: null,
        });
    });

    it('lists standard grains, then custom ones, and adds a checked one in order', async () => {
        const { onApply } = renderEditor({ initialView: 'settings' });
        const labels = screen
            .getAllByRole('checkbox')
            .map((box) => box.closest('.mantine-Checkbox-root')?.textContent);
        expect(labels).toEqual([
            'Second',
            'Minute',
            'Hour',
            'Day',
            'Week',
            'Month',
            'Quarter',
            'Year',
            'Fiscal quarter',
            'Retail week',
        ]);
        await userEvent.click(screen.getByRole('checkbox', { name: 'Day' }));
        await userEvent.click(
            screen.getByRole('checkbox', { name: 'Retail week' }),
        );
        await userEvent.click(screen.getByRole('button', { name: 'Back' }));
        expect(
            screen.getByRole('button', { name: 'Settings: 5 grains' }),
        ).toHaveFocus();
        await userEvent.click(screen.getByRole('button', { name: 'Apply' }));
        expect(onApply).toHaveBeenCalledWith({
            enabledGranularities: [
                DateGranularity.DAY,
                DateGranularity.WEEK,
                DateGranularity.MONTH,
                'fiscal_quarter',
                'retail_week',
            ],
            defaultGranularity: DateGranularity.MONTH,
        });
    });

    it('clears the default when its grain is unchecked', async () => {
        const { onApply } = renderEditor({ initialView: 'settings' });
        await userEvent.click(screen.getByRole('checkbox', { name: 'Month' }));
        await userEvent.click(screen.getByRole('button', { name: 'Apply' }));
        expect(onApply).toHaveBeenCalledWith({
            enabledGranularities: [DateGranularity.WEEK, 'fiscal_quarter'],
            defaultGranularity: null,
        });
    });

    it('keeps the last enabled grain checked', () => {
        renderEditor({
            enabledGranularities: [DateGranularity.WEEK],
            defaultGranularity: null,
            initialView: 'settings',
        });
        expect(screen.getByRole('checkbox', { name: 'Week' })).toBeDisabled();
        expect(screen.getByRole('checkbox', { name: 'Day' })).toBeEnabled();
    });

    it('says the grains are for every date zoom', () => {
        renderEditor({ initialView: 'settings' });
        expect(
            screen.getByText('For every date zoom on this dashboard.'),
        ).toBeInTheDocument();
    });

    it.each([
        [['Revenue zoom'], 'Revenue zoom uses Week'],
        [
            ['Revenue zoom', 'Orders zoom'],
            'Revenue zoom and Orders zoom use Week',
        ],
        [
            ['Revenue zoom', 'Orders zoom', 'Payments zoom'],
            'Revenue zoom and 2 other zooms use Week',
        ],
    ])('locks a grain in use by %j, saying who', async (names, reason) => {
        renderEditor({
            initialView: 'settings',
            namedZooms: names.map((name, index) => ({
                uuid: `z${index}`,
                name,
                granularity: DateGranularity.WEEK,
            })),
        });
        const week = screen.getByRole('checkbox', { name: 'Week' });
        expect(week).toBeDisabled();
        expect(screen.getByRole('checkbox', { name: 'Month' })).toBeEnabled();
        await userEvent.hover(screen.getByText('Week'));
        expect(await screen.findByRole('tooltip')).toHaveTextContent(reason);
    });

    it('names the zoom over the last-grain reason when both apply', async () => {
        renderEditor({
            enabledGranularities: [DateGranularity.WEEK],
            defaultGranularity: null,
            initialView: 'settings',
            namedZooms: [
                { uuid: 'z1', name: 'Revenue zoom', granularity: 'Week' },
            ],
        });
        await userEvent.hover(screen.getByText('Week'));
        expect(await screen.findByRole('tooltip')).toHaveTextContent(
            'Revenue zoom uses Week',
        );
    });

    it("tells a viewer that clearing goes back to the dashboard's default", async () => {
        const { onApply } = renderViewer(DateGranularity.MONTH);
        const grain = screen.getByRole('combobox', { name: 'Default zoom' });
        expect(grain).toHaveValue('Month');
        expect(screen.queryByText(/^If cleared,/)).not.toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: /^Settings/ }),
        ).not.toBeInTheDocument();
        await userEvent.click(grain);
        await userEvent.click(
            await screen.findByRole('option', { name: 'Week' }),
        );
        expect(
            screen.getByText('If cleared, tiles use the default, Month.'),
        ).toBeInTheDocument();
        await userEvent.click(screen.getByRole('button', { name: 'Apply' }));
        expect(onApply).toHaveBeenCalledWith(DateGranularity.WEEK);
    });

    it('tells a viewer with no default that tiles keep their own grain', async () => {
        renderViewer(null);
        const grain = screen.getByRole('combobox', { name: 'Default zoom' });
        expect(grain).toHaveAttribute('placeholder', 'None');
        await userEvent.click(grain);
        await userEvent.click(
            await screen.findByRole('option', { name: 'Week' }),
        );
        expect(
            screen.getByText('If cleared, tiles keep their own grain.'),
        ).toBeInTheDocument();
    });
});
