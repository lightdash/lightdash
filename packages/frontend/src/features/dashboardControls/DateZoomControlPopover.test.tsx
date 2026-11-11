import { DateGranularity, type DateZoomControl } from '@lightdash/common';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../testing/testUtils';
import { DateZoomControlPopover } from './DateZoomControlPopover';

const zoom: DateZoomControl = {
    uuid: 'z1',
    name: 'Revenue zoom',
    granularity: DateGranularity.WEEK,
};
const granularities = [
    DateGranularity.DAY,
    DateGranularity.WEEK,
    DateGranularity.MONTH,
    'fiscal_quarter',
];
const customLabels = { fiscal_quarter: 'Fiscal quarter' };

const renderEditor = (
    overrides: Partial<
        Extract<
            ComponentProps<typeof DateZoomControlPopover>['mode'],
            { kind: 'editor' }
        >
    > = {},
    control: DateZoomControl = zoom,
) => {
    const onApply = vi.fn();
    const onChooseTiles = vi.fn();
    const onCancel = vi.fn();
    renderWithProviders(
        <DateZoomControlPopover
            control={control}
            granularities={granularities}
            customLabels={customLabels}
            mode={{
                kind: 'editor',
                isNew: false,
                sections: [{ id: 's1', name: 'Revenue' }],
                tileCount: 2,
                totalTileCount: 5,
                initialView: 'value',
                onChooseTiles,
                onApply,
                ...overrides,
            }}
            onCancel={onCancel}
        />,
    );
    return { onApply, onChooseTiles, onCancel };
};

const renderViewer = (granularity: string | null) => {
    const onApply = vi.fn();
    renderWithProviders(
        <DateZoomControlPopover
            control={zoom}
            granularities={granularities}
            customLabels={customLabels}
            mode={{ kind: 'viewer', granularity, onApply }}
            onCancel={vi.fn()}
        />,
    );
    return { onApply };
};

describe('DateZoomControlPopover', () => {
    it('edits the grain and hands the zoom back on Apply', async () => {
        const { onApply, onChooseTiles } = renderEditor();
        const grain = screen.getByRole('combobox', { name: 'Revenue zoom' });
        expect(grain).toHaveValue('Week');
        expect(grain).toHaveFocus();
        await userEvent.click(
            screen.getByRole('button', {
                name: 'Zooms 2 of 5 tiles. Choose tiles',
            }),
        );
        expect(onChooseTiles).toHaveBeenCalled();
        await userEvent.click(grain);
        await userEvent.click(
            await screen.findByRole('option', { name: 'Fiscal quarter' }),
        );
        await userEvent.click(screen.getByRole('button', { name: 'Apply' }));
        expect(onApply).toHaveBeenCalledWith({
            ...zoom,
            granularity: 'fiscal_quarter',
        });
    });

    it('renames, falling back to "Date zoom" when emptied', async () => {
        const { onApply } = renderEditor();
        await userEvent.click(screen.getByRole('button', { name: 'Rename' }));
        await userEvent.clear(screen.getByRole('textbox', { name: 'Name' }));
        await userEvent.keyboard('{Enter}');
        expect(
            screen.getByRole('dialog', { name: 'Date zoom' }),
        ).toBeInTheDocument();
        await userEvent.click(screen.getByRole('button', { name: 'Apply' }));
        expect(onApply).toHaveBeenCalledWith({ ...zoom, name: 'Date zoom' });
    });

    it('sets the section and hides it from viewers in Settings', async () => {
        const { onApply } = renderEditor({ initialView: 'settings' });
        expect(
            screen.getByText(
                'The grain still applies to its tiles when hidden.',
            ),
        ).toBeInTheDocument();
        await userEvent.click(
            screen.getByRole('combobox', { name: 'Section' }),
        );
        await userEvent.click(
            await screen.findByRole('option', { name: 'Revenue' }),
        );
        await userEvent.click(
            screen.getByRole('switch', { name: 'Show to viewers' }),
        );
        await userEvent.click(screen.getByRole('button', { name: 'Back' }));
        expect(
            screen.getByRole('button', { name: 'Settings: Revenue' }),
        ).toHaveFocus();
        expect(screen.getByText('Hidden from viewers')).toBeInTheDocument();
        await userEvent.click(screen.getByRole('button', { name: 'Apply' }));
        expect(onApply).toHaveBeenCalledWith({
            ...zoom,
            sectionId: 's1',
            hidden: true,
        });
    });

    it('opens a new zoom on its name and blocks Apply at no tiles', () => {
        renderEditor({ isNew: true, tileCount: 0 });
        expect(screen.getByRole('textbox', { name: 'Name' })).toHaveFocus();
        expect(
            screen.getByRole('button', {
                name: 'Zooms no tiles. Choose tiles',
            }),
        ).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled();
    });

    it('shows a viewer the saved grain only while their pick differs', async () => {
        const { onApply } = renderViewer(DateGranularity.MONTH);
        expect(
            screen.queryByRole('button', { name: 'Rename' }),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: /Choose tiles/ }),
        ).not.toBeInTheDocument();
        expect(
            screen.getByText('If cleared, tiles use the saved grain, Week.'),
        ).toBeInTheDocument();
        await userEvent.click(
            screen.getByRole('button', { name: 'Clear grain' }),
        );
        expect(screen.queryByText(/^If cleared,/)).not.toBeInTheDocument();
        await userEvent.click(screen.getByRole('button', { name: 'Apply' }));
        expect(onApply).toHaveBeenCalledWith(null);
    });

    it('shows a viewer with no pick the saved grain, without a caption', () => {
        renderViewer(null);
        expect(
            screen.getByRole('combobox', { name: 'Revenue zoom' }),
        ).toHaveValue('Week');
        expect(screen.queryByText(/^If cleared,/)).not.toBeInTheDocument();
    });
});
