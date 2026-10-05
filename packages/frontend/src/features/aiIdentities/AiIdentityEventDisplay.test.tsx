import { type AiIdentityEvent } from '@lightdash/common';
import { MantineProvider } from '@mantine/core';
import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { EventStatus, RelativeTime } from './AiIdentityEventDisplay';
import { actionLabel, actorLabel } from './eventLabels';

const event: AiIdentityEvent = {
    aiIdentityEventUuid: 'event',
    aiIdentityAccountUuid: 'account',
    aiIdentityUuid: null,
    actorType: 'user',
    actorUserUuid: 'user',
    actorName: 'First Last',
    action: 'export',
    targetCount: 3,
    status: 'success',
    detail: null,
    createdAt: new Date(),
};

it('uses readable action and actor labels', () => {
    expect(actionLabel('export')).toBe('Exported');
    expect(actionLabel('bulk_test')).toBe('Tested (bulk)');
    expect(actionLabel('update_override')).toBe('AI identity name changed');
    expect(actorLabel(event)).toBe('First Last');
    expect(
        actorLabel({ ...event, actorType: 'scheduler', actorName: 'Job' }),
    ).toBe('Lightdash');
    expect(actorLabel({ ...event, actorType: 'api', actorName: null })).toBe(
        'API',
    );
});

it.each(['success', 'error'] as const)(
    'exposes %s and its detail on the status icon',
    async (status) => {
        const detail = status === 'error' ? 'Storage unavailable' : null;
        const label =
            status === 'error' ? 'Error: Storage unavailable' : 'Success';
        render(
            <MantineProvider>
                <EventStatus event={{ ...event, status, detail }} />
            </MantineProvider>,
        );
        const icon = screen.getByRole('img', { name: label });
        fireEvent.mouseEnter(icon);
        expect(await screen.findByRole('tooltip')).toHaveTextContent(label);
    },
);

it('shows a relative time with the full timestamp on hover', async () => {
    const value = new Date(Date.now() - 5 * 60 * 1000);
    render(
        <MantineProvider>
            <RelativeTime value={value} />
        </MantineProvider>,
    );
    fireEvent.mouseEnter(screen.getByText('5 minutes ago'));
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
        value.toLocaleString(),
    );
});
