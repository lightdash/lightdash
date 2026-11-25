import { type SemanticLayerDrafter } from '@lightdash/common';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../testing/testUtils';
import { OthersDraftNotice } from './OthersDraftNotice';

const api = vi.hoisted(() => vi.fn());
vi.mock('../../providers/LightdashApi/useLightdashApi', () => ({
    useLightdashApi: () => api,
}));
vi.mock('../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: () => ({ data: { enabled: true } }),
}));

const DAY_MS = 24 * 60 * 60 * 1000;

const drafter = (
    overrides: Partial<SemanticLayerDrafter> = {},
): SemanticLayerDrafter => ({
    userUuid: 'person-a',
    name: 'Person A',
    paths: [
        'metrics.revenue.sql',
        'metrics.revenue.description',
        'metrics.orders_count.sql',
        'primary_key',
    ],
    lastActiveAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    isStale: false,
    canDiscard: false,
    ...overrides,
});

const stale = (canDiscard: boolean) =>
    drafter({
        lastActiveAt: new Date(Date.now() - 9 * DAY_MS),
        isStale: true,
        canDiscard,
    });

const renderNotice = (drafters: SemanticLayerDrafter[]) =>
    renderWithProviders(
        <OthersDraftNotice
            projectUuid="project"
            model="things"
            drafters={drafters}
            publishMode="live"
        />,
    );

beforeEach(() => {
    api.mockReset();
    api.mockImplementation(({ url, method }: { url: string; method: string }) =>
        url.endsWith('/semantic-studio/drafts/person-a/models/things')
            ? Promise.resolve(
                  method === 'GET'
                      ? {
                            model: 'things',
                            contentBefore: 'name: things\n',
                            contentAfter: 'name: things\nlabel: Things\n',
                        }
                      : undefined,
              )
            : Promise.reject(new Error(`Unexpected ${method} ${url}`)),
    );
});

describe('OthersDraftNotice', () => {
    it('names the person, groups the fields in words and says what it means', () => {
        renderNotice([drafter()]);
        expect(
            screen.getByText(
                'Person A is editing 2 metrics and the primary key · last active about 2 hours ago',
            ),
        ).toBeInTheDocument();
        expect(screen.queryByText(/metrics\.revenue/)).not.toBeInTheDocument();
        expect(
            screen.getByText(
                'You can still make changes. If you both change the same field, whoever publishes second is asked which version to keep.',
            ),
        ).toBeInTheDocument();
        expect(screen.queryByText('stale')).not.toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Discard draft' }),
        ).not.toBeInTheDocument();
    });

    it('lists each of several people, with one line on what it means', () => {
        renderNotice([
            drafter(),
            drafter({
                userUuid: 'person-b',
                name: 'Person B',
                paths: ['dimensions.status'],
            }),
        ]);
        expect(screen.getByText(/^Person A is editing/)).toBeInTheDocument();
        expect(
            screen.getByText(/^Person B is editing 1 dimension · last active/),
        ).toBeInTheDocument();
        expect(
            screen.getAllByRole('button', { name: 'View changes' }),
        ).toHaveLength(2);
        expect(screen.getAllByText(/^You can still make changes/)).toHaveLength(
            1,
        );
    });

    it('labels a stale draft, and offers no discard to someone who is not an admin', () => {
        renderNotice([stale(false)]);
        expect(screen.getByText('stale')).toBeInTheDocument();
        expect(screen.getByText(/last active 9 days ago/)).toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Discard draft' }),
        ).not.toBeInTheDocument();
    });

    it('lets an admin discard a stale draft, after a confirm', async () => {
        renderNotice([stale(true)]);
        await userEvent.click(
            screen.getByRole('button', { name: 'Discard draft' }),
        );
        expect(api).not.toHaveBeenCalled();
        expect(
            await screen.findByText(/for them too, and cannot be undone/),
        ).toBeInTheDocument();
        const [, confirm] = screen.getAllByRole('button', {
            name: 'Discard draft',
        });
        await userEvent.click(confirm);
        expect(api).toHaveBeenCalledWith(
            expect.objectContaining({
                url: '/projects/project/semantic-studio/drafts/person-a/models/things',
                method: 'DELETE',
            }),
        );
    });

    it('shows their changes read-only, with nothing to accept or discard', async () => {
        renderNotice([drafter()]);
        await userEvent.click(
            screen.getByRole('button', { name: 'View changes' }),
        );
        const dialog = await screen.findByRole('dialog');
        expect(
            within(dialog).getByText(
                'Read only. Only they can publish or discard it.',
            ),
        ).toBeInTheDocument();
        expect(api).toHaveBeenCalledWith(
            expect.objectContaining({
                url: '/projects/project/semantic-studio/drafts/person-a/models/things',
                method: 'GET',
            }),
        );
        expect(
            within(dialog).queryByRole('button', {
                name: /discard|keep|publish|accept/i,
            }),
        ).not.toBeInTheDocument();
    });
});
