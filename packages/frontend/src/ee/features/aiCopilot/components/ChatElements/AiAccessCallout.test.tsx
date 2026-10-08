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
import { AiAccessGate } from './AiAccessGate';
import { getAiAccessRefusal } from './aiAccessRefusal';
const mocks = vi.hoisted(() => ({
    can: vi.fn(),
    popup: vi.fn(),
    login: vi.fn(),
    isLoading: false,
    error: null as Error | null,
}));
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
    useSnowflakeAiLoginPopup: (attribution: unknown) => {
        mocks.popup(attribution);
        return {
            mutate: mocks.login,
            isLoading: mocks.isLoading,
            error: mocks.error,
        };
    },
}));
const refusal: AiAccessRefusal = {
    code: 'ai_access_refused',
    reason: AiAccessRefusalReason.NEEDS_SIGN_IN,
    message: 'Sign in to run AI queries.',
    action: AiAccessRefusalAction.SIGN_IN,
    settingsUrl: null,
    connectUrl: null,
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
        mocks.isLoading = false;
        mocks.error = null;
    });
    it.each(['card', 'inline'] as const)(
        'replaces the composer with the %s callout, then restores it',
        (variant) => {
            const content = (isLoading: boolean, refused: boolean) => (
                <MemoryRouter>
                    <AiAccessGate
                        projectUuid="project"
                        refusal={refused ? refusal : null}
                        isLoading={isLoading}
                        isError={false}
                        refetch={vi.fn()}
                        variant={variant}
                    >
                        <textarea aria-label="Composer" />
                    </AiAccessGate>
                </MemoryRouter>
            );
            const { rerender } = renderWithProviders(content(true, true));
            expect(
                screen.getByTestId('ai-access-placeholder'),
            ).toBeInTheDocument();
            expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
            expect(
                screen.queryByRole('button', { name: 'Connect agent' }),
            ).not.toBeInTheDocument();
            rerender(content(false, true));
            expect(
                screen.queryByTestId('ai-access-placeholder'),
            ).not.toBeInTheDocument();
            expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
            expect(
                screen.getByRole('button', { name: 'Connect agent' }),
            ).toBeEnabled();
            expect(!!screen.queryByRole('heading')).toBe(variant === 'card');
            fireEvent.click(
                screen.getByRole('button', { name: 'Connect agent' }),
            );
            expect(mocks.login).toHaveBeenCalledOnce();
            expect(mocks.popup).toHaveBeenLastCalledWith({
                entryPoint: 'chat_card',
                projectUuid: 'project',
            });
            rerender(content(false, false));
            expect(
                screen.getByRole('textbox', { name: 'Composer' }),
            ).toBeEnabled();
            expect(
                screen.queryByRole('button', { name: 'Connect agent' }),
            ).not.toBeInTheDocument();
        },
    );

    it.each(['card', 'inline'] as const)(
        'shows the expired refusal in the %s variant',
        (variant) => {
            const message = 'Your agent connection expired. Connect again.';
            renderWithProviders(
                <MemoryRouter>
                    <AiAccessCallout
                        projectUuid="project"
                        variant={variant}
                        refusal={{
                            ...refusal,
                            reason: AiAccessRefusalReason.SIGN_IN_EXPIRED,
                            message,
                        }}
                    />
                </MemoryRouter>,
            );
            expect(screen.getByText(message)).toBeInTheDocument();
            expect(screen.queryByText(/Connect once/)).not.toBeInTheDocument();
            fireEvent.click(
                screen.getByRole('button', { name: 'Connect agent' }),
            );
            expect(mocks.login).toHaveBeenCalled();
        },
    );
    it('offers agent session sign-in', () => {
        render(AiAccessRefusalAction.SIGN_IN);
        expect(
            screen.getByRole('heading', {
                name: 'Connect your agent to your warehouse',
            }),
        ).toBeInTheDocument();
        expect(screen.queryByRole('link')).not.toBeInTheDocument();
        expect(
            screen.getByText(
                'Connect once so the agent can query Snowflake as you, in a session your warehouse can verify.',
            ),
        ).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Connect agent' }));
        expect(mocks.login).toHaveBeenCalled();
    });
    it('disables sign-in while the popup is open', () => {
        mocks.isLoading = true;
        render(AiAccessRefusalAction.SIGN_IN);
        expect(
            screen.getByRole('button', { name: 'Connect agent' }),
        ).toBeDisabled();
    });
    it('shows the popup error and allows another attempt', () => {
        mocks.error = new Error('The warehouse rejected this session.');
        render(AiAccessRefusalAction.SIGN_IN);
        expect(screen.getByRole('alert')).toHaveTextContent(
            mocks.error.message,
        );
        expect(
            screen.getByRole('button', { name: 'Connect agent' }),
        ).toBeEnabled();
    });
    it('renders a compact inline sign-in action', () => {
        renderWithProviders(
            <MemoryRouter>
                <AiAccessCallout
                    projectUuid="project"
                    refusal={refusal}
                    variant="inline"
                />
            </MemoryRouter>,
        );
        expect(screen.queryByRole('heading')).not.toBeInTheDocument();
        expect(
            screen.getByText(
                'Connect your agent to your warehouse to run this.',
            ),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Connect agent' }),
        ).toBeEnabled();
        expect(screen.queryByRole('link')).not.toBeInTheDocument();
    });
    it('links organization managers to warehouse credential settings', () => {
        mocks.can.mockReturnValue(true);
        render(AiAccessRefusalAction.ASK_ADMIN);
        expect(
            screen.getByRole('link', { name: 'Review agent identity' }),
        ).toHaveAttribute('href', '/generalSettings/warehouseCredentials');
        expect(mocks.can).toHaveBeenCalledWith('manage', 'Organization');
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
