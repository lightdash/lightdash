import { type SlackSettings } from '@lightdash/common';
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../testing/testUtils';
import { SchedulerFormSlackInput } from './SchedulerFormSlackInput';

const getSlackMock = vi.fn();

vi.mock('../../../../hooks/slack/useSlack', () => ({
    useGetSlack: () => getSlackMock(),
}));

vi.mock('../../../../components/common/SlackChannelSelect', () => ({
    SlackChannelSelect: ({ disabled }: { disabled: boolean }) => (
        <input data-testid="slack-channel-select" disabled={disabled} />
    ),
}));

const available = { available: true, missingScopes: [] };

const installation = (
    overrides: Partial<SlackSettings['features']>,
    hasRequiredScopes: boolean,
): SlackSettings =>
    ({
        organizationUuid: 'org',
        slackTeamName: 'team',
        createdAt: new Date(),
        scopes: [],
        notificationChannel: undefined,
        appProfilePhotoUrl: undefined,
        hasRequiredScopes,
        features: {
            scheduledDeliveries: available,
            customAppProfile: available,
            linkUnfurling: available,
            writebackReactions: available,
            aiAgent: available,
            ...overrides,
        },
    }) as SlackSettings;

describe('SchedulerFormSlackInput', () => {
    it('is enabled when deliveries are available even if other scopes are missing', () => {
        getSlackMock.mockReturnValue({
            data: installation(
                {
                    customAppProfile: {
                        available: false,
                        missingScopes: ['chat:write.customize'],
                    },
                },
                false,
            ),
            isInitialLoading: false,
        });
        renderWithProviders(
            <SchedulerFormSlackInput value={[]} onChange={() => {}} />,
        );
        expect(screen.getByTestId('slack-channel-select')).toBeEnabled();
    });

    it('is disabled when a delivery scope is missing', () => {
        getSlackMock.mockReturnValue({
            data: installation(
                {
                    scheduledDeliveries: {
                        available: false,
                        missingScopes: ['files:write'],
                    },
                },
                false,
            ),
            isInitialLoading: false,
        });
        renderWithProviders(
            <SchedulerFormSlackInput value={[]} onChange={() => {}} />,
        );
        expect(screen.getByTestId('slack-channel-select')).toBeDisabled();
    });

    it('is disabled when there is no Slack installation', () => {
        getSlackMock.mockReturnValue({
            data: undefined,
            isInitialLoading: false,
        });
        renderWithProviders(
            <SchedulerFormSlackInput value={[]} onChange={() => {}} />,
        );
        expect(screen.getByTestId('slack-channel-select')).toBeDisabled();
    });
});
