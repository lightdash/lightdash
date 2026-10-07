import {
    AiCredentialMethod,
    AiAgentMarkerLevel,
    AiPrincipalKind,
    AiSetupScriptFormat,
    WarehouseTypes,
    type AiWarehouseCapabilities,
} from '@lightdash/common';
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../testing/testUtils';
import { AiModeCards } from './AiModeCards';
const capabilities: AiWarehouseCapabilities = {
    marker: {
        level: AiAgentMarkerLevel.VERIFIED_SESSION,
        signals: [{ name: 'Query tag', where: 'Agent query tag' }],
        note: null,
        enforce: null,
    },
    warehouseType: WarehouseTypes.SNOWFLAKE,
    setupFormat: AiSetupScriptFormat.SQL,
    principals: {
        group: { available: true, method: AiCredentialMethod.KEY },
        person: { available: false, reason: 'Sign-in is unavailable' },
        twin: { available: false, reason: 'Twins are coming soon' },
        shared: { available: true, method: AiCredentialMethod.KEY },
    },
    transports: {
        direct: { available: true },
        procedure: { available: false, reason: 'No procedure support' },
    },
};
describe('AI mode cards', () => {
    it('disables unavailable modes and shows the reason', () => {
        const onChange = vi.fn();
        renderWithProviders(
            <AiModeCards
                capabilities={capabilities}
                value={AiPrincipalKind.TWIN}
                onChange={onChange}
            />,
        );
        const radio = screen.getByRole('radio', { name: 'Per person' });
        expect(radio).toBeDisabled();
        expect(screen.getByText('Twins are coming soon')).toBeInTheDocument();
        fireEvent.click(radio);
        expect(onChange).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('radio', { name: 'One shared' }));
        expect(onChange).toHaveBeenCalledWith(AiPrincipalKind.SHARED);
    });
});
