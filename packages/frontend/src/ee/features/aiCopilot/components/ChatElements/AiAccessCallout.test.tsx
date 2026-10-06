import {
    AiAccessRefusalAction,
    AiAccessRefusalReason,
    type AiAccessRefusal,
} from '@lightdash/common';
import { fireEvent, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../../testing/testUtils';
import { AiAccessCallout } from './AiAccessCallout';
import { getAiAccessRefusal } from './aiAccessRefusal';
const mocks = vi.hoisted(() => ({ can: vi.fn(), login: vi.fn() }));
vi.mock('../../../../../providers/App/useApp', () => ({
    default: () => ({
        health: {},
        user: { data: { ability: { can: mocks.can } } },
    }),
}));
vi.mock('../../../../../hooks/useProject', () => ({
    useProject: () => ({
        data: { projectUuid: 'project', organizationUuid: 'org' },
    }),
}));
vi.mock('../../../../../hooks/useSnowflake', () => ({
    useSnowflakeAiLoginPopup: () => ({ mutate: mocks.login, isLoading: false }),
}));
const refusal: AiAccessRefusal = {
    code: 'ai_access_refused',
    reason: AiAccessRefusalReason.NEEDS_SIGN_IN,
    message: 'Sign in to run AI queries.',
    action: AiAccessRefusalAction.SIGN_IN,
    settingsUrl: null,
};
const render = (action: AiAccessRefusal['action']) =>
    renderWithProviders(
        <MemoryRouter>
            <AiAccessCallout
                projectUuid="project"
                refusal={{ ...refusal, action }}
            />
        </MemoryRouter>,
    );
describe('AI access callout', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.can.mockReturnValue(false);
    });
    it('offers AI sign-in', () => {
        render(AiAccessRefusalAction.SIGN_IN);
        expect(screen.getByText(refusal.message)).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Sign in for AI' }));
        expect(mocks.login).toHaveBeenCalled();
    });
    it('links project updaters to settings', () => {
        mocks.can.mockReturnValue(true);
        render(AiAccessRefusalAction.ASK_ADMIN);
        expect(
            screen.getByRole('link', { name: 'Review AI access' }),
        ).toHaveAttribute(
            'href',
            '/generalSettings/projectManagement/project/aiAccess',
        );
        expect(mocks.can).toHaveBeenCalledWith(
            'update',
            expect.objectContaining({ projectUuid: 'project' }),
        );
    });
    it('does not link other users to settings', () => {
        render(AiAccessRefusalAction.ASK_ADMIN);
        expect(screen.queryByRole('link')).not.toBeInTheDocument();
    });
    it('shows only the message when there is no action', () => {
        mocks.can.mockReturnValue(true);
        render(null);
        expect(screen.getByText(refusal.message)).toBeInTheDocument();
        expect(screen.queryByRole('button')).not.toBeInTheDocument();
        expect(screen.queryByRole('link')).not.toBeInTheDocument();
    });
    it('extracts a structured tool refusal without parsing ordinary tool errors', () => {
        expect(getAiAccessRefusal({ structuredContent: { refusal } })).toEqual(
            refusal,
        );
        expect(
            getAiAccessRefusal({ structuredContent: { refusal: null } }),
        ).toBeNull();
        expect(getAiAccessRefusal({ result: 'failed' })).toBeNull();
    });
});
