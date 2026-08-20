import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import ChartDownloadOptions from './ChartDownloadOptions';

const showToastError = vi.fn();

vi.mock('../../../hooks/toaster/useToaster', () => ({
    default: () => ({ showToastError }),
}));

describe('ChartDownloadOptions', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('reports copy and download failures when the chart is unavailable', () => {
        renderWithProviders(
            <ChartDownloadOptions getChartInstance={() => undefined} />,
        );

        const [copyButton] = screen.getAllByRole('button');
        fireEvent.click(copyButton);
        fireEvent.click(screen.getByRole('button', { name: 'Download' }));

        expect(showToastError).toHaveBeenNthCalledWith(1, {
            title: 'Unable to copy chart image',
        });
        expect(showToastError).toHaveBeenNthCalledWith(2, {
            title: 'Unable to download chart image',
        });
        expect(document.querySelector('.tabler-icon-check')).toBeNull();
    });

    it('keeps the selected format when it is selected again', async () => {
        renderWithProviders(
            <ChartDownloadOptions getChartInstance={() => undefined} />,
        );

        const formatSelect = screen.getByRole('textbox');
        await userEvent.click(formatSelect);
        await userEvent.click(
            await screen.findByRole('option', { name: 'PNG' }),
        );

        expect(formatSelect).toHaveValue('PNG');
    });
});
