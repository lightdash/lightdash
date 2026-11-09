import { type DateZoomControl } from '@lightdash/common';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../testing/testUtils';
import { DateZoomControlPopover } from './DateZoomControlPopover';

const control: DateZoomControl = {
    uuid: 'revenue',
    name: 'Revenue zoom',
    granularity: 'Month',
};

const renderPopover = (
    props: Partial<ComponentProps<typeof DateZoomControlPopover>> = {},
) => {
    const handlers = {
        onResolvePending: vi.fn(),
        onChange: vi.fn(),
        onCancel: vi.fn(),
        onApply: vi.fn(),
        onRemove: vi.fn(),
        onChooseTiles: vi.fn(),
    };
    renderWithProviders(
        <DateZoomControlPopover
            control={control}
            granularityData={[
                { value: 'Week', label: 'Week' },
                { value: 'Month', label: 'Month' },
            ]}
            tileCount={2}
            totalTileCount={2}
            isNew={false}
            isAsking={false}
            {...handlers}
            {...props}
        />,
    );
    return { ...handlers, user: userEvent.setup() };
};

describe('DateZoomControlPopover', () => {
    it('says how many tiles it zooms and offers Choose tiles', async () => {
        const { user, onChooseTiles } = renderPopover({ tileCount: 1 });
        await user.click(
            screen.getByRole('button', {
                name: 'Zooms 1 of 2 tiles. Choose tiles',
            }),
        );
        expect(onChooseTiles).toHaveBeenCalled();
    });

    it('reads "all" tiles as a plain count', () => {
        renderPopover();
        expect(screen.getByRole('dialog')).toHaveTextContent('Zooms 2 tiles');
    });

    it('blocks Apply while the zoom has no tiles', () => {
        renderPopover({ tileCount: 0 });
        expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled();
    });

    it('writes the picked grain to the draft', async () => {
        const { user, onChange } = renderPopover();
        await user.click(screen.getByRole('combobox', { name: 'Granularity' }));
        await user.click(await screen.findByRole('option', { name: 'Week' }));
        expect(onChange).toHaveBeenCalledWith({
            ...control,
            granularity: 'Week',
        });
    });

    it('asks to apply first while another pill waits', async () => {
        const { user, onResolvePending } = renderPopover({ isAsking: true });
        expect(screen.getByRole('status')).toHaveTextContent(
            'Apply changes to Revenue zoom first?',
        );
        await user.click(screen.getByRole('button', { name: 'Discard' }));
        expect(onResolvePending).toHaveBeenCalledWith(false);
    });
});
