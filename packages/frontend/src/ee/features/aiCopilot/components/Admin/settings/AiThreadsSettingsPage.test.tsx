import {
    OrganizationMemberRole,
    type HealthState,
    type LightdashUserWithAbilityRules,
} from '@lightdash/common';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import nock from 'nock';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { BASE_API_URL } from '../../../../../../api';
// oxlint-disable-next-line vitest-js/no-mocks-import -- Shared test fixture, not an auto-mocked module.
import mockHealthResponse from '../../../../../../testing/__mocks__/api/healthResponse.mock';
import { renderWithProviders } from '../../../../../../testing/testUtils';
import { AiThreadsSettingsPage } from './AiThreadsSettingsPage';

const organizationUuid = '172a2270-000f-42be-9c68-c4752c23ae51';
const analyticsConfig: HealthState['ai'] = {
    analyticsProjectUuid: 'analytics-project',
    analyticsDashboardUuid: 'analytics-dashboard',
    isAmbientAiEnabled: false,
    threadDumpEnabled: false,
};

const renderSettings = (
    user: Partial<LightdashUserWithAbilityRules>,
    ai: HealthState['ai'] = analyticsConfig,
) => {
    nock(BASE_API_URL)
        .get('/api/v1/health')
        .query({ skipMigrationCheck: true })
        .reply(200, { status: 'ok', results: mockHealthResponse({ ai }) });

    return renderWithProviders(
        <MemoryRouter>
            <AiThreadsSettingsPage />
        </MemoryRouter>,
        { user, health: { ai } },
    );
};

describe('AiThreadsSettingsPage', () => {
    beforeEach(() => {
        nock(BASE_API_URL)
            .get('/api/v1/aiAgents/settings')
            .reply(200, { status: 'ok', results: { aiAgentsVisible: true } })
            .get('/api/v1/slack/')
            .reply(200, { status: 'ok', results: {} })
            .get('/api/v1/aiAgents/admin/threads')
            .query(true)
            .reply(200, {
                status: 'ok',
                results: { data: { threads: [] } },
            })
            .get('/api/v1/aiAgents/admin/review-items')
            .query(true)
            .reply(200, { status: 'ok', results: [] })
            .get('/api/v1/aiAgents/admin/agents')
            .reply(200, { status: 'ok', results: [] })
            .get('/api/v1/org/projects')
            .reply(200, { status: 'ok', results: [] })
            .get('/api/v1/org/users')
            .query(true)
            .reply(200, { status: 'ok', results: { data: [] } });
    });

    it.each<{
        name: string;
        user: Partial<LightdashUserWithAbilityRules>;
    }>([
        {
            name: 'a project AI agent manager',
            user: {
                role: OrganizationMemberRole.MEMBER,
                abilityRules: [
                    {
                        action: 'manage',
                        subject: 'AiAgent',
                        conditions: { projectUuid: 'project-1' },
                    },
                ],
            },
        },
        {
            name: 'an admin role without organization management permission',
            user: { role: OrganizationMemberRole.ADMIN, abilityRules: [] },
        },
        {
            name: 'a user who can only manage another organization',
            user: {
                abilityRules: [
                    {
                        action: 'manage',
                        subject: 'Organization',
                        conditions: { organizationUuid: 'another-org' },
                    },
                ],
            },
        },
    ])('hides Insights from $name', async ({ user }) => {
        renderSettings({ organizationUuid, ...user });

        await screen.findByText('0 threads');
        await waitFor(() => expect(nock.isDone()).toBe(true));

        expect(
            screen.queryByRole('button', { name: 'Insights' }),
        ).not.toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'New Thread' })).toBeVisible();
    });

    it.each([OrganizationMemberRole.ADMIN, OrganizationMemberRole.MEMBER])(
        'opens Insights with organization management permission and a %s role',
        async (role) => {
            const user = userEvent.setup();
            renderSettings({
                role,
                organizationUuid,
                abilityRules: [
                    {
                        action: 'manage',
                        subject: 'Organization',
                        conditions: { organizationUuid },
                    },
                ],
            });

            await screen.findByText('0 threads');
            await waitFor(() => expect(nock.isDone()).toBe(true));

            const url = 'https://analytics.example.com/embed/dashboard';
            nock(BASE_API_URL)
                .get('/api/v1/aiAgents/admin/embed-token')
                .reply(200, { status: 'ok', results: { token: 'token', url } });

            await user.click(screen.getByRole('button', { name: 'Insights' }));

            expect(
                await screen.findByTitle('Analytics Dashboard'),
            ).toHaveAttribute('src', url);
        },
    );

    it.each(['analyticsProjectUuid', 'analyticsDashboardUuid'] as const)(
        'hides Insights when %s is not configured',
        async (missingConfig) => {
            renderSettings(
                {
                    organizationUuid,
                    abilityRules: [
                        {
                            action: 'manage',
                            subject: 'Organization',
                            conditions: { organizationUuid },
                        },
                    ],
                },
                { ...analyticsConfig, [missingConfig]: undefined },
            );

            await screen.findByText('0 threads');
            await waitFor(() => expect(nock.isDone()).toBe(true));

            expect(
                screen.queryByRole('button', { name: 'Insights' }),
            ).not.toBeInTheDocument();
        },
    );
});
