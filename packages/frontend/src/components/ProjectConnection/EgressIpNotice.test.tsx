import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../testing/testUtils';
import { EgressIpNotice } from './EgressIpNotice';

const flag = vi.hoisted(() => ({ enabled: true }));

vi.mock('../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: () => ({ data: { enabled: flag.enabled } }),
}));

const renderNotice = (staticIp: string) =>
    renderWithProviders(<EgressIpNotice />, { health: { staticIp } });

const mockClipboard = (writeText: (value: string) => Promise<void>) => {
    const spy = vi.fn(writeText);
    Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: spy },
        configurable: true,
    });
    return spy;
};

describe('EgressIpNotice', () => {
    afterEach(() => {
        flag.enabled = true;
    });

    it('lists every IP and copies one or all of them', async () => {
        const user = userEvent.setup();
        renderNotice('35.1.1.1, 35.2.2.2');
        const writeText = mockClipboard(() => Promise.resolve());

        expect(await screen.findByText('35.1.1.1')).toBeInTheDocument();
        expect(screen.getByText('35.2.2.2')).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: 'Copy 35.2.2.2' }));
        expect(writeText).toHaveBeenLastCalledWith('35.2.2.2');

        await user.click(screen.getByRole('button', { name: 'Copy all' }));
        expect(writeText).toHaveBeenLastCalledWith('35.1.1.1, 35.2.2.2');
    });

    it('selects the IP when the clipboard refuses', async () => {
        const user = userEvent.setup();
        renderNotice('35.1.1.1');
        mockClipboard(() => Promise.reject(new Error('denied')));

        await user.click(
            await screen.findByRole('button', { name: 'Copy 35.1.1.1' }),
        );

        expect(window.getSelection()?.toString()).toBe('35.1.1.1');
        expect(screen.queryByRole('button', { name: 'Copy all' })).toBeNull();
    });

    it('renders nothing when the kill switch is on', async () => {
        const { rerender } = renderNotice('35.1.1.1');
        expect(await screen.findByText('35.1.1.1')).toBeInTheDocument();

        flag.enabled = false;
        rerender(<EgressIpNotice />);

        expect(screen.queryByText('35.1.1.1')).toBeNull();
    });
});
