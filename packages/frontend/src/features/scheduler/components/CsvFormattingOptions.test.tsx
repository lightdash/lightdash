import { SchedulerFormat, XlsxExportContent } from '@lightdash/common';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import { CsvFormattingOptions } from './CsvFormattingOptions';
import { Limit, Values } from './types';

vi.mock('../../../hooks/health/useHealth', () => ({
    default: () => ({ data: undefined }),
}));

const renderOptions = (
    props: Partial<Parameters<typeof CsvFormattingOptions>[0]> = {},
) =>
    renderWithProviders(
        <CsvFormattingOptions
            format={SchedulerFormat.XLSX}
            formatted={Values.FORMATTED}
            onFormattedChange={vi.fn()}
            limit={Limit.TABLE}
            onLimitChange={vi.fn()}
            customLimit={1}
            onCustomLimitChange={vi.fn()}
            exportPivotedData
            onExportPivotedDataChange={vi.fn()}
            xlsxFileLayout="zip"
            onXlsxFileLayoutChange={vi.fn()}
            inline
            {...props}
        />,
    );

describe('CsvFormattingOptions chart content', () => {
    it('hides the chart content choice when no handler is given', () => {
        renderOptions();
        expect(screen.queryByText('As images')).not.toBeInTheDocument();
    });

    it('hides the chart content choice for CSV', () => {
        renderOptions({
            format: SchedulerFormat.CSV,
            onXlsxContentChange: vi.fn(),
        });
        expect(screen.queryByText('As images')).not.toBeInTheDocument();
    });

    it('lets an XLSX export switch charts to images', async () => {
        const user = userEvent.setup();
        const onXlsxContentChange = vi.fn();
        renderOptions({ onXlsxContentChange });

        expect(screen.getByRole('radio', { name: 'As data' })).toBeChecked();
        await user.click(screen.getByRole('radio', { name: 'As images' }));
        expect(onXlsxContentChange).toHaveBeenCalledWith(
            XlsxExportContent.CHART_IMAGE,
        );
    });
});
