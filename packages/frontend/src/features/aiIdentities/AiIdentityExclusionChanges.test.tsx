import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { AiIdentityExclusionChanges } from './AiIdentityExclusionChanges';
import { aiIdentityApi } from './api';
import { actionLabel } from './eventLabels';

vi.mock('./api', () => ({ aiIdentityApi: { requestLog: vi.fn() } }));

it('shows change sentences and HH:MM with the full date on hover', async () => {
    const createdAt = new Date(Date.now() - 120000);
    vi.mocked(aiIdentityApi.requestLog).mockResolvedValue({
        data: [
            {
                aiIdentityEventUuid: 'event',
                aiIdentityAccountUuid: 'account',
                aiIdentityUuid: null,
                actorType: 'user',
                actorUserUuid: 'admin',
                actorName: 'Alex Admin',
                action: 'ai_role_exclusions_changed',
                targetCount: 1,
                status: 'success',
                detail: 'ANALYST_AI · Database: DB · Added: PII_* · Removed: *_RAW',
                createdAt,
            },
        ],
        pagination: {
            page: 1,
            pageSize: 50,
            totalResults: 1,
            totalPageCount: 1,
        },
    });
    render(
        <MantineProvider>
            <QueryClientProvider client={new QueryClient()}>
                <AiIdentityExclusionChanges accountUuid="account" />
            </QueryClientProvider>
        </MantineProvider>,
    );
    expect(screen.getByText('Change log')).toBeInTheDocument();
    expect(
        await screen.findByText('Alex Admin excluded PII_* in ANALYST_AI'),
    ).toBeInTheDocument();
    expect(
        screen.getByText('Alex Admin removed *_RAW from ANALYST_AI'),
    ).toBeInTheDocument();
    expect(aiIdentityApi.requestLog).toHaveBeenCalledWith(1, false, 'account');
    await userEvent.hover(
        screen.getAllByText(
            createdAt.toLocaleTimeString('en-GB', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: false,
            }),
        )[0],
    );
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
        createdAt.toLocaleString(),
    );
});

it.each([
    ['ai_role_created', 'AI role created'],
    ['ai_role_deleted', 'AI role deleted'],
    ['ai_role_exclusions_changed', 'Exclusions changed'],
])('labels %s in the request log', (action, label) => {
    expect(actionLabel(action)).toBe(label);
});

it('loads older changes for the same account', async () => {
    vi.mocked(aiIdentityApi.requestLog)
        .mockResolvedValueOnce({
            data: [],
            pagination: {
                page: 1,
                pageSize: 50,
                totalResults: 51,
                totalPageCount: 2,
            },
        })
        .mockResolvedValueOnce({
            data: [],
            pagination: {
                page: 2,
                pageSize: 50,
                totalResults: 51,
                totalPageCount: 2,
            },
        });
    render(
        <MantineProvider>
            <QueryClientProvider client={new QueryClient()}>
                <AiIdentityExclusionChanges accountUuid="account" />
            </QueryClientProvider>
        </MantineProvider>,
    );
    await userEvent.click(
        await screen.findByRole('button', { name: 'Load more' }),
    );
    expect(aiIdentityApi.requestLog).toHaveBeenLastCalledWith(
        2,
        false,
        'account',
    );
});
