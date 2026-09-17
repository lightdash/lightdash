import {
    RoadmapItemPriority,
    RoadmapItemStatus,
    type RoadmapItem,
} from '@lightdash/common';
import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import { mockRoadmapProject, mockRoadmapResults } from './roadmap.mock';
import { roadmapApi } from './roadmapApi';
import { RoadmapProjects } from './RoadmapProjects';

const projectUrls = [
    'https://customer.slack.com/archives/C123/p1789462222021839',
    'https://customer.slack.com/archives/C123/p1789462222021840?thread_ts=1789462222.021839&cid=C123',
];
const ticketUrls = [
    'https://customer.slack.com/archives/G456/p1789462222021841',
    'https://customer.slack.com/archives/G456/p1789462222021842',
];

const ticket: RoadmapItem & { projectId: string | null } = {
    ticketId: 'PROD-1',
    title: 'Ticket alpha',
    description: null,
    status: RoadmapItemStatus.BACKLOG,
    priority: RoadmapItemPriority.MEDIUM,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    issueUrl: null,
    pullRequestUrl: null,
    slackThreadUrls: [],
    projectId: null,
};

function expectExternalLink(element: HTMLElement, url: string) {
    expect(element).toHaveAttribute('href', url);
    expect(element).toHaveAttribute('target', '_blank');
    expect(element).toHaveAttribute('rel', 'noopener noreferrer');
}

describe('roadmap Slack threads', () => {
    afterEach(() => vi.restoreAllMocks());

    it.each([0, 1, 2])(
        'shows %i links per item in cards, table rows and detail dialogs without activating navigation',
        async (count) => {
            const project = {
                ...mockRoadmapProject('alpha'),
                hasDirectNeed: true,
                slackThreadUrls: projectUrls.slice(0, count),
            };
            vi.spyOn(roadmapApi, 'getProjects').mockImplementation(
                async (query) =>
                    mockRoadmapResults(
                        !query.statuses || query.statuses.includes('planned')
                            ? [project]
                            : [],
                    ),
            );
            vi.spyOn(roadmapApi, 'getRequests').mockImplementation(
                async (query) => {
                    const data =
                        !query.statuses || query.statuses.includes('planned')
                            ? [
                                  {
                                      ...ticket,
                                      slackThreadUrls: ticketUrls.slice(
                                          0,
                                          count,
                                      ),
                                  },
                              ]
                            : [];
                    return {
                        data,
                        pagination: {
                            page: 1,
                            pageSize: 100,
                            totalIssues: data.length,
                            totalPages: data.length ? 1 : 0,
                        },
                        expiresAt: '2099-01-01T00:00:00Z',
                        facets: {
                            statusCounts: {
                                Backlog: data.length,
                                Building: 0,
                                Shipped: 0,
                                Canceled: 0,
                            },
                            priorityCounts: {
                                Urgent: 0,
                                High: 0,
                                Medium: data.length,
                                Low: 0,
                                'No priority': 0,
                            },
                        },
                    };
                },
            );
            renderWithProviders(
                <MemoryRouter>
                    <RoadmapProjects
                        cacheKey="slack-test-org:user"
                        canFollow={false}
                    />
                </MemoryRouter>,
            );

            for (const view of ['Board', 'Table']) {
                await screen.findByRole('button', {
                    name: 'Open Project alpha',
                });
                if (view === 'Table') {
                    await userEvent.click(
                        screen.getByRole('radio', { name: view }),
                    );
                }
                const openProject = await screen.findByRole('button', {
                    name: 'Open Project alpha',
                });
                const openTicket = await screen.findByRole('button', {
                    name: 'Open ticket Ticket alpha',
                });
                for (const [openButton, urls] of [
                    [openProject, projectUrls],
                    [openTicket, ticketUrls],
                ] as const) {
                    expect(
                        within(openButton).queryByRole('link'),
                    ).not.toBeInTheDocument();
                    expect(
                        within(openButton).queryByRole('button'),
                    ).not.toBeInTheDocument();
                    const item = within(openButton.parentElement!);
                    if (count === 0) {
                        expect(
                            item.queryByLabelText(/Slack thread/),
                        ).not.toBeInTheDocument();
                    } else if (count === 1) {
                        const link = item.getByRole('link', {
                            name: 'View Slack thread',
                        });
                        expectExternalLink(link, urls[0]);
                        fireEvent.click(link);
                        link.focus();
                        await userEvent.keyboard('{Enter}');
                    } else {
                        const trigger = item.getByRole('button', {
                            name: 'View 2 Slack threads',
                        });
                        trigger.focus();
                        await userEvent.keyboard('{Enter}');
                        const menu = await screen.findByRole('menu');
                        const links = within(menu).getAllByRole('menuitem');
                        links.forEach((link, index) =>
                            expectExternalLink(link, urls[index]),
                        );
                        await userEvent.click(links[1]);
                        expect(
                            screen.queryByRole('dialog'),
                        ).not.toBeInTheDocument();
                        trigger.focus();
                        await userEvent.keyboard('{Enter}');
                        const keyboardLink = within(
                            await screen.findByRole('menu'),
                        ).getByRole('menuitem', { name: 'Slack thread 1' });
                        keyboardLink.focus();
                        await userEvent.keyboard('{Enter}');
                        await userEvent.keyboard('{Escape}');
                    }
                    expect(
                        screen.queryByRole('dialog'),
                    ).not.toBeInTheDocument();
                    expect(
                        screen.getByRole('heading', { name: 'Roadmap' }),
                    ).toBeInTheDocument();

                    await userEvent.click(openButton);
                    const dialog = await screen.findByRole('dialog');
                    const links = within(dialog).queryAllByRole('link');
                    expect(links).toHaveLength(count);
                    links.forEach((link, index) => {
                        expectExternalLink(link, urls[index]);
                        expect(link).toHaveAccessibleName(
                            count === 1
                                ? 'View Slack thread'
                                : `Slack thread ${index + 1}`,
                        );
                    });
                    expect(
                        within(dialog).queryByText('Slack threads') !== null,
                    ).toBe(count > 0);
                    await userEvent.keyboard('{Escape}');
                }
            }
        },
    );
});
