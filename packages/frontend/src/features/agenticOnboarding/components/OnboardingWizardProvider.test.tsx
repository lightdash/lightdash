import { WarehouseTypes } from '@lightdash/common';
import { fireEvent, screen } from '@testing-library/react';
import { type FC } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import { useOnboardingWizard } from '../context/wizardContext';
import OnboardingWizardProvider from './OnboardingWizardProvider';

const Consumer: FC = () => {
    const wizard = useOnboardingWizard();
    const location = useLocation();
    return (
        <div>
            <span data-testid="projectUuid">
                {wizard.projectUuid ?? 'null'}
            </span>
            <span data-testid="warehouse">{wizard.warehouse ?? 'null'}</span>
            <span data-testid="method">{wizard.method ?? 'null'}</span>
            <span data-testid="path">{location.pathname}</span>
            <span data-testid="search">{location.search}</span>
            <span data-testid="state">{JSON.stringify(location.state)}</span>
            <button
                type="button"
                onClick={() => wizard.goToProjectConnect('proj-9', 'acc1')}
            >
                go
            </button>
            <button type="button" onClick={() => wizard.clearMethod()}>
                clearMethod
            </button>
        </div>
    );
};

const renderAt = (entry: string) =>
    renderWithProviders(
        <MemoryRouter initialEntries={[entry]}>
            <Routes>
                <Route
                    path="/createProject/:projectUuid/:onboardingStep"
                    element={
                        <OnboardingWizardProvider>
                            <Consumer />
                        </OnboardingWizardProvider>
                    }
                />
            </Routes>
        </MemoryRouter>,
    );

describe('OnboardingWizardProvider', () => {
    it('exposes project context from the route param so a refresh stays in the wizard', () => {
        renderAt(
            '/createProject/proj-1/connect?warehouse=snowflake&method=cli_sso',
        );
        expect(screen.getByTestId('projectUuid').textContent).toBe('proj-1');
        expect(screen.getByTestId('warehouse').textContent).toBe(
            WarehouseTypes.SNOWFLAKE,
        );
        expect(screen.getByTestId('method').textContent).toBe('cli_sso');
    });

    it('clearMethod stays on the project-scoped route and keeps the account param', () => {
        renderAt(
            '/createProject/proj-1/connect?warehouse=snowflake&method=cli_sso&account=acc1',
        );
        fireEvent.click(screen.getByRole('button', { name: 'clearMethod' }));

        expect(screen.getByTestId('path').textContent).toBe(
            '/createProject/proj-1/connect',
        );
        expect(screen.getByTestId('search').textContent).toBe(
            '?warehouse=snowflake&account=acc1',
        );
        expect(screen.getByTestId('method').textContent).toBe('null');
    });

    it('goToProjectConnect navigates to the project-scoped connect route preserving query + handoff', () => {
        renderAt(
            '/createProject/proj-1/connect?warehouse=snowflake&method=cli_sso',
        );
        fireEvent.click(screen.getByRole('button', { name: 'go' }));

        expect(screen.getByTestId('path').textContent).toBe(
            '/createProject/proj-9/connect',
        );
        expect(screen.getByTestId('search').textContent).toBe(
            '?warehouse=snowflake&method=cli_sso&account=acc1',
        );
        expect(screen.getByTestId('state').textContent).toContain(
            '"justCreated":true',
        );
        expect(screen.getByTestId('state').textContent).not.toContain(
            'account',
        );
    });
});
