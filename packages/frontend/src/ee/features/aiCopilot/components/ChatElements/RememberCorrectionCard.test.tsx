import { addTeamVocabularyLine } from '@lightdash/common';
import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../../testing/testUtils';
import { RememberCorrectionCard } from './RememberCorrectionCard';

const state = vi.hoisted(() => ({
    flag: true,
    canManage: true,
    instruction: 'Be concise.' as string | null,
    mutate: vi.fn(),
}));

vi.mock('../../../../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: () => ({ data: { enabled: state.flag } }),
}));
vi.mock('../../hooks/useAiAgentPermission', () => ({
    useAiAgentPermission: () => state.canManage,
}));
vi.mock('../../hooks/useProjectAiAgents', () => ({
    useProjectAiAgent: () => ({ data: { instruction: state.instruction } }),
    useRememberCorrectionMutation: () => ({
        mutate: state.mutate,
        isLoading: false,
    }),
}));

const sentence = 'territory is what we call region';
const render = (coveredBy: string | null = null) =>
    renderWithProviders(
        <RememberCorrectionCard
            projectUuid="project-1"
            agentUuid="agent-1"
            threadUuid="thread-1"
            messageUuid="message-1"
            userPrompt={sentence}
            correction={{ kind: 'alias', fieldId: null, coveredBy }}
        />,
    );

describe('RememberCorrectionCard', () => {
    beforeEach(() => {
        state.flag = true;
        state.canManage = true;
        state.instruction = 'Be concise.';
        state.mutate.mockReset();
        localStorage.clear();
    });

    it("offers agent admins to save the user's own sentence", () => {
        render();
        expect(screen.getByText(`“${sentence}”`)).toBeVisible();
        fireEvent.click(
            screen.getByRole('button', {
                name: 'Save for everyone using this agent',
            }),
        );
        expect(state.mutate).toHaveBeenCalledWith({
            messageUuid: 'message-1',
            remember: true,
        });
    });

    it('stays hidden without the flag, without manage rights, or when already covered', () => {
        state.flag = false;
        const { unmount } = render();
        expect(screen.queryByText('Remember this for next time?')).toBeNull();
        unmount();
        state.flag = true;
        state.canManage = false;
        const second = render();
        expect(screen.queryByText('Remember this for next time?')).toBeNull();
        second.unmount();
        state.canManage = true;
        render('Territory means region.');
        expect(screen.queryByText('Remember this for next time?')).toBeNull();
    });

    it('shows the saved state with undo once the sentence is in the instructions', () => {
        state.instruction = addTeamVocabularyLine('Be concise.', sentence);
        render();
        fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
        expect(state.mutate).toHaveBeenCalledWith({
            messageUuid: 'message-1',
            remember: false,
        });
    });

    it('remembers "Not now" for this viewer', () => {
        const { unmount } = render();
        fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
        expect(screen.queryByText('Remember this for next time?')).toBeNull();
        unmount();
        render();
        expect(screen.queryByText('Remember this for next time?')).toBeNull();
    });
});
