import { DateGranularity } from '@lightdash/common';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../testing/testUtils';
import { DefaultZoomPopover } from './DefaultZoomPopover';

const customLabels = {
    retail_week: 'Retail week',
    fiscal_quarter: 'Fiscal quarter',
};
const enabled = [DateGranularity.WEEK, DateGranularity.MONTH, 'fiscal_quarter'];

const renderEditor = () => {
    const onApply = vi.fn();
    renderWithProviders(
        <DefaultZoomPopover
            enabledGranularities={enabled}
            defaultGranularity={DateGranularity.MONTH}
            customLabels={customLabels}
            mode={{ kind: 'editor', tileCount: 3, onApply }}
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
        expect(onApply).toHaveBeenCalledWith({ defaultGranularity: null });
    });

    it('offers only the enabled grains, with no Settings', async () => {
        renderEditor();
        expect(
            screen.queryByRole('button', { name: /^Settings/ }),
        ).not.toBeInTheDocument();
        await userEvent.click(
            screen.getByRole('combobox', { name: 'Default zoom' }),
        );
        expect(
            (await screen.findAllByRole('option')).map(
                (option) => option.textContent,
            ),
        ).toEqual(['Week', 'Month', 'Fiscal quarter']);
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
