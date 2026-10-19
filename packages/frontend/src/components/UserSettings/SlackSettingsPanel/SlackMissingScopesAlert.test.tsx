import { type SlackFeatureAvailabilityMap } from '@lightdash/common';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import { SlackMissingScopesAlert } from './SlackMissingScopesAlert';

const ok = { available: true, missingScopes: [] };
const allAvailable: SlackFeatureAvailabilityMap = {
    scheduledDeliveries: ok,
    customAppProfile: ok,
    linkUnfurling: ok,
    writebackReactions: ok,
    aiAgent: ok,
};

describe('SlackMissingScopesAlert', () => {
    it('renders no alert when every feature is available', () => {
        renderWithProviders(
            <SlackMissingScopesAlert features={allAvailable} />,
        );
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('lists each unavailable feature with its missing scopes', () => {
        renderWithProviders(
            <SlackMissingScopesAlert
                features={{
                    ...allAvailable,
                    customAppProfile: {
                        available: false,
                        missingScopes: ['chat:write.customize'],
                    },
                    aiAgent: {
                        available: false,
                        missingScopes: ['channels:history', 'groups:history'],
                    },
                }}
            />,
        );
        expect(screen.getByRole('alert')).toBeInTheDocument();
        expect(
            screen.getByText(/Custom app profile photo/),
        ).toBeInTheDocument();
        expect(screen.getByText(/chat:write\.customize/)).toBeInTheDocument();
        expect(screen.getByText(/AI agents/)).toBeInTheDocument();
        expect(
            screen.getByText(/channels:history, groups:history/),
        ).toBeInTheDocument();
        expect(
            screen.queryByText(/Scheduled deliveries/),
        ).not.toBeInTheDocument();
    });
});
