import { DateGranularity } from '@lightdash/common';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState, type FC } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../testing/testUtils';
import { DefaultZoomPopover } from './DefaultZoomPopover';

const customLabels = {
    retail_week: 'Retail week',
    fiscal_quarter: 'Fiscal quarter',
};
const enabled = [DateGranularity.WEEK, DateGranularity.MONTH, 'fiscal_quarter'];

// The draft (or pick) lives above the popover, as in the editor provider
const Harness: FC<{
    isViewer: boolean;
    defaultGranularity: string | null;
    onApply: (value: string | null) => void;
}> = ({ isViewer, defaultGranularity, onApply }) => {
    const [value, setValue] = useState(defaultGranularity);
    return (
        <DefaultZoomPopover
            enabledGranularities={enabled}
            value={value}
            customLabels={customLabels}
            mode={
                isViewer ? { kind: 'viewer' } : { kind: 'editor', tileCount: 3 }
            }
            isAsking={false}
            onResolvePending={vi.fn()}
            onChange={setValue}
            onCancel={vi.fn()}
            onApply={() => onApply(value)}
        />
    );
};

const renderEditor = () => {
    const onApply = vi.fn();
    renderWithProviders(
        <Harness
            isViewer={false}
            defaultGranularity={DateGranularity.MONTH}
            onApply={(defaultGranularity) => onApply({ defaultGranularity })}
        />,
    );
    return { onApply };
};

const renderViewer = (defaultGranularity: string | null) => {
    const onApply = vi.fn();
    renderWithProviders(
        <Harness
            isViewer
            defaultGranularity={defaultGranularity}
            onApply={onApply}
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

    it("tells a viewer that clearing leaves tiles on their own grain, as the menu's None", async () => {
        const { onApply } = renderViewer(DateGranularity.MONTH);
        const grain = screen.getByRole('combobox', { name: 'Default zoom' });
        expect(grain).toHaveValue('Month');
        expect(
            screen.getByText('If cleared, tiles keep their own grain.'),
        ).toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: /^Settings/ }),
        ).not.toBeInTheDocument();
        await userEvent.click(
            screen.getByRole('button', { name: 'Clear grain' }),
        );
        expect(grain).toHaveAttribute('placeholder', 'None');
        await userEvent.click(screen.getByRole('button', { name: 'Apply' }));
        expect(onApply).toHaveBeenCalledWith(null);
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
