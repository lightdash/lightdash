import {
    AiIdentityState,
    FeatureFlags,
    type AiAccessForUser,
} from '@lightdash/common';
import { fireEvent, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../../testing/testUtils';
import type * as AiIdentityAccessModule from '../../hooks/useAiIdentityAccess';
import { store } from '../../store';
import { AgentChatInput } from './AgentChatInput';

const access: AiAccessForUser = {
    projectUuid: 'project-1',
    restrictionsOn: true,
    warehouseType: 'snowflake',
    aiIdentityRequired: true,
    automaticSyncRefusal: false,
    state: AiIdentityState.PENDING,
    aiIdentityName: 'PERSON_AI',
    lastCheckedAt: null,
    action: 'ask_admin',
    message: 'Ask an admin to set up your AI identity.',
    rawSqlAllowed: false,
};
const { accessQuery } = vi.hoisted(() => ({ accessQuery: vi.fn() }));
vi.mock('../../hooks/useAiIdentityAccess', async (importOriginal) => ({
    ...(await importOriginal<typeof AiIdentityAccessModule>()),
    useAiIdentityAccess: accessQuery,
    useAiIdentitySignIn: () => ({ mutate: vi.fn(), isLoading: false }),
}));
vi.mock('../../hooks/useDeepResearch', () => ({
    useHasActiveDeepResearchRun: () => false,
}));
vi.mock('../../../../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: (flag: FeatureFlags) => ({
        data: { enabled: flag === FeatureFlags.SnowflakeAiTwins },
    }),
}));

const renderInput = () => {
    const onSubmit = vi.fn();
    renderWithProviders(
        <Provider store={store}>
            <MemoryRouter>
                <AgentChatInput
                    onSubmit={onSubmit}
                    projectUuid="project-1"
                    agentUuid="agent-1"
                    defaultValue="Show sales"
                    showSuggestions={false}
                />
            </MemoryRouter>
        </Provider>,
    );
    return onSubmit;
};

describe('AI access in the shared chat composer', () => {
    it.each([
        AiIdentityState.PENDING,
        AiIdentityState.FAILED,
        AiIdentityState.NEEDS_SIGN_IN,
    ])('blocks submission for %s', (state) => {
        accessQuery.mockReturnValue({
            data: { ...access, state },
            isSuccess: true,
        });
        const submit = renderInput();
        fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });
        expect(submit).not.toHaveBeenCalled();
        expect(screen.getByText(access.message!)).toBeInTheDocument();
    });
    it('keeps the composer usable while access loads; the server still refuses an unready AI identity', () => {
        accessQuery.mockReturnValue({ isLoading: true, isSuccess: false });
        const submit = renderInput();
        fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });
        expect(submit).toHaveBeenCalled();
        expect(screen.getByText('Checking AI access')).toBeInTheDocument();
    });
    it('keeps the composer usable when the access check fails; the server still refuses an unready AI identity', () => {
        accessQuery.mockReturnValue({
            isError: true,
            isSuccess: false,
            refetch: vi.fn(),
        });
        const submit = renderInput();
        fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });
        expect(submit).toHaveBeenCalled();
        expect(
            screen.getByText('Could not check your AI access.'),
        ).toBeInTheDocument();
    });
    it('shows the trust line and permits submission when ready', () => {
        accessQuery.mockReturnValue({
            data: { ...access, state: AiIdentityState.READY },
            isSuccess: true,
        });
        const submit = renderInput();
        fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });
        expect(submit).toHaveBeenCalledWith(
            expect.objectContaining({ message: 'Show sales' }),
        );
        expect(
            screen.getByText('Runs as PERSON_AI · AI identity'),
        ).toBeInTheDocument();
    });
});
