import { ExternalSourceType } from '@lightdash/common';
import { fireEvent, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import { SourceTablePreviewDrawer } from './SourceTablePreviewDrawer';

vi.mock('../hooks/useExternalSources', () => ({
    useExternalSourceTablePreview: () => {
        const fields = Array.from({ length: 100 }, (_, i) => `field_${i}`);
        return {
            data: {
                columns: Object.fromEntries(
                    fields.map((id) => [id, { reference: id, type: 'string' }]),
                ),
                sampleRows: [
                    Object.fromEntries(fields.map((id) => [id, `value_${id}`])),
                ],
            },
        };
    },
}));

afterEach(() => vi.restoreAllMocks());

it('scrolls to the last source column with its matching sample value', async () => {
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(400);
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(200);
    renderWithProviders(
        <SourceTablePreviewDrawer
            projectUuid="project"
            sourceRef={{
                sourceUuid: 'source',
                tableUuid: 'table',
                sourceType: ExternalSourceType.CSV,
            }}
            tableLabel="Orders"
            onClose={vi.fn()}
        />,
        undefined,
        { columnWindowing: true },
    );

    const table = within(
        await screen.findByRole('tabpanel', { name: 'Data preview' }),
    ).getByRole('table');
    expect(await within(table).findByText('value_field_0')).toBeInTheDocument();
    expect(within(table).queryByText('value_field_99')).toBeNull();
    expect(within(table).queryByText('field_99')).toBeNull();

    const viewport = table.parentElement!;
    viewport.scrollLeft = 15000 - 400;
    fireEvent.scroll(viewport);
    expect(
        await within(table).findByText('value_field_99'),
    ).toBeInTheDocument();
    expect(within(table).getByText('field_99')).toBeInTheDocument();
    expect(within(table).queryByText('field_0')).toBeNull();
});
