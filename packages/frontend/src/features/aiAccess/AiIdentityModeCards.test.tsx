import {
    AiAgentMarkerLevel,
    AiCredentialMethod,
    AiSetupScriptFormat,
    WarehouseTypes,
    type AiWarehouseCapabilities,
} from '@lightdash/common';
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../testing/testUtils';
import { AiIdentityModeCards } from './AiIdentityModeCards';

const capabilities: AiWarehouseCapabilities = {
    warehouseType: WarehouseTypes.POSTGRES,
    marker: {
        level: AiAgentMarkerLevel.ADVISORY_SESSION,
        channels: ['application_name'],
        identify: 'Session marker',
        enforce: null,
    },
    setupFormat: AiSetupScriptFormat.SQL,
    principals: {
        person: { available: true, method: AiCredentialMethod.MARKER },
        twin: { available: true, method: AiCredentialMethod.KEY },
        group: { available: true, method: AiCredentialMethod.KEY },
        shared: { available: true, method: AiCredentialMethod.KEY },
    },
    transports: {
        direct: { available: true },
        procedure: { available: false, reason: 'Coming soon' },
    },
};
describe('Agent identity choices', () => {
    it('selects marked person and offers separate principals', () => {
        const onChange = vi.fn();
        renderWithProviders(
            <AiIdentityModeCards
                capabilities={capabilities}
                separate={false}
                onChange={onChange}
                disabled={false}
            />,
        );
        expect(
            screen.getByRole('radio', { name: 'Marked person' }),
        ).toBeChecked();
        expect(screen.getByText('Advisory session')).toBeInTheDocument();
        expect(screen.getByText('Person: nothing to do.')).toBeInTheDocument();
        fireEvent.click(
            screen.getByRole('radio', { name: 'Separate principal' }),
        );
        expect(onChange).toHaveBeenCalledWith(true);
    });
    it('explains the Snowflake sign-in step', () => {
        renderWithProviders(
            <AiIdentityModeCards
                capabilities={{
                    ...capabilities,
                    principals: {
                        ...capabilities.principals,
                        person: {
                            available: true,
                            method: AiCredentialMethod.SIGN_IN,
                        },
                    },
                }}
                separate={false}
                onChange={vi.fn()}
                disabled={false}
            />,
        );
        expect(
            screen.getByText(
                'Person: complete the AI sign-in to use a verified agentic session.',
            ),
        ).toBeInTheDocument();
    });
    it('disables marked person when the warehouse has no channel', () => {
        renderWithProviders(
            <AiIdentityModeCards
                capabilities={{
                    ...capabilities,
                    principals: {
                        ...capabilities.principals,
                        person: {
                            available: false,
                            reason: 'No marker channel',
                        },
                    },
                }}
                separate={false}
                onChange={vi.fn()}
                disabled={false}
            />,
        );
        expect(
            screen.getByRole('radio', { name: 'Marked person' }),
        ).toBeDisabled();
        expect(screen.getByText('No marker channel')).toBeInTheDocument();
    });
});
