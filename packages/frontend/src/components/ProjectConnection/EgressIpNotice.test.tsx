import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type FC } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import useApp from '../../providers/App/useApp';
import { renderWithProviders } from '../../testing/testUtils';
import { EgressIpNotice } from './EgressIpNotice';

const flag = vi.hoisted(() => ({ enabled: true }));

vi.mock('../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: () => ({ data: { enabled: flag.enabled } }),
}));

const HealthLoaded: FC = () => {
    const { health } = useApp();
    return health.data ? <span>health loaded</span> : null;
};

const renderNotice = (staticIp: string | undefined) =>
    renderWithProviders(
        <>
            <EgressIpNotice />
            <HealthLoaded />
        </>,
        { health: { staticIp } },
    );

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

    it('labels one address in the singular', async () => {
        renderNotice('35.245.81.252');

        expect(
            await screen.findByText('Lightdash IP address'),
        ).toBeInTheDocument();
        expect(
            screen.getByText(
                "Lightdash connects to your warehouse from this instance's IP address. Add it to your firewall or allowlist.",
            ),
        ).toBeInTheDocument();
        expect(screen.getByText('35.245.81.252')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Copy all' })).toBeNull();
    });

    it('labels several addresses in the plural', async () => {
        renderNotice('35.1.1.1,35.2.2.2');

        expect(
            await screen.findByText('Lightdash IP addresses'),
        ).toBeInTheDocument();
        expect(
            screen.getByText(
                "Lightdash connects to your warehouse from this instance's IP addresses. Add them to your firewall or allowlist.",
            ),
        ).toBeInTheDocument();
    });

    it.each([
        ['empty', ''],
        ['unset', undefined],
        ['blank', ' , '],
    ])('renders nothing when STATIC_IP is %s', async (_label, staticIp) => {
        renderNotice(staticIp);

        await screen.findByText('health loaded');
        expect(screen.queryByText(/Lightdash connects/)).toBeNull();
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
    });

    it('renders nothing when the kill switch is on', async () => {
        const { rerender } = renderNotice('35.1.1.1');
        expect(await screen.findByText('35.1.1.1')).toBeInTheDocument();

        flag.enabled = false;
        rerender(<EgressIpNotice />);

        expect(screen.queryByText('35.1.1.1')).toBeNull();
    });
});
