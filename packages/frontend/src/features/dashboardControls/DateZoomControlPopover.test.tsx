import { DateGranularity, type DateZoomControl } from '@lightdash/common';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState, type ComponentProps, type FC } from 'react';
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

type EditorProps = Partial<ComponentProps<typeof DateZoomControlPopover>>;

// The draft lives above the popover, as in the editor provider
const Editor: FC<{
    control: DateZoomControl;
    overrides: EditorProps;
    onApply: (control: DateZoomControl) => void;
    onChooseTiles: () => void;
}> = ({ control, overrides, onApply, onChooseTiles }) => {
    const [draft, setDraft] = useState(control);
    return (
        <DateZoomControlPopover
            control={draft}
            granularities={granularities}
            customLabels={customLabels}
            isNew={false}
            sections={[{ id: 's1', name: 'Revenue' }]}
            tileCount={2}
            totalTileCount={5}
            initialView="value"
            onChooseTiles={onChooseTiles}
            onChange={setDraft}
            isAsking={false}
            onResolvePending={vi.fn()}
            onCancel={vi.fn()}
            onApply={() => onApply(draft)}
            {...overrides}
        />
    );
};

const renderEditor = (
    overrides: EditorProps = {},
    control: DateZoomControl = zoom,
) => {
    const onApply = vi.fn();
    const onChooseTiles = vi.fn();
    renderWithProviders(
        <Editor
            control={control}
            overrides={overrides}
            onApply={onApply}
            onChooseTiles={onChooseTiles}
        />,
    );
    return { onApply, onChooseTiles };
};

describe('DateZoomControlPopover', () => {
    it('edits the grain and hands the zoom back on Apply', async () => {
        const { onApply, onChooseTiles } = renderEditor();
        const grain = screen.getByRole('combobox', { name: 'Revenue zoom' });
        expect(grain).toHaveValue('Week');
        expect(grain).toHaveFocus();
        await userEvent.click(
            screen.getByRole('button', {
                name: 'Applies to 2 of 5 tiles. Choose tiles',
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
                name: 'Applies to no tiles. Choose tiles',
            }),
        ).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled();
    });
});

describe('DateZoomControlPopover asking', () => {
    it('asks to apply first, with the body inert', async () => {
        const onResolvePending = vi.fn();
        renderWithProviders(
            <DateZoomControlPopover
                control={zoom}
                granularities={granularities}
                customLabels={customLabels}
                isNew={false}
                sections={[]}
                tileCount={2}
                totalTileCount={5}
                initialView="value"
                onChooseTiles={vi.fn()}
                onChange={vi.fn()}
                isAsking
                onResolvePending={onResolvePending}
                onCancel={vi.fn()}
                onApply={vi.fn()}
            />,
        );
        expect(
            screen.getByText('Apply changes to Revenue zoom first?'),
        ).toBeInTheDocument();
        await userEvent.click(screen.getByRole('button', { name: 'Discard' }));
        expect(onResolvePending).toHaveBeenCalledWith(false);
    });
});
