import { MantineProvider, Title } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import nock from 'nock';
import { MemoryRouter, Route, Routes } from 'react-router';
import { BASE_API_URL } from '../../api';
import OnboardingLayout from './OnboardingLayout';

const renderLayout = (withAccountSwitch: boolean) =>
    render(
        <QueryClientProvider client={new QueryClient()}>
            <MantineProvider env="test">
                <MemoryRouter>
                    <Routes>
                        <Route
                            path="/"
                            element={
                                <OnboardingLayout
                                    withAccountSwitch={withAccountSwitch}
                                >
                                    <Title order={1}>
                                        Set up your workspace
                                    </Title>
                                </OnboardingLayout>
                            }
                        />
                        <Route
                            path="/login"
                            element={<Title order={1}>Sign in</Title>}
                        />
                    </Routes>
                </MemoryRouter>
            </MantineProvider>
        </QueryClientProvider>,
    );

describe('OnboardingLayout', () => {
    it('shows the current step in the card progress', () => {
        render(
            <MantineProvider env="test">
                <OnboardingLayout
                    withAccountSwitch={false}
                    progress={{
                        currentStep: 2,
                        steps: ['Organization', 'About you'],
                    }}
                >
                    <Title order={1}>Your details</Title>
                </OnboardingLayout>
            </MantineProvider>,
        );
        expect(
            screen.getByRole('listitem', { name: 'About you, step 2 of 2' }),
        ).toHaveAttribute('aria-current', 'step');
    });

    it('keeps setup in one main card without app navigation or a version footer', () => {
        const { container } = renderLayout(false);
        expect(screen.getByRole('main')).toContainElement(
            screen.getByRole('heading', { name: 'Set up your workspace' }),
        );
        expect(container.querySelector('header')).not.toBeInTheDocument();
        expect(container.querySelector('footer')).not.toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Use another account' }),
        ).not.toBeInTheDocument();
    });
    it('lets authenticated users log out from the card', async () => {
        nock(BASE_API_URL)
            .get('/api/v1/logout')
            .reply(200, { status: 'ok', results: null });
        renderLayout(true);
        fireEvent.click(
            screen.getByRole('button', { name: 'Use another account' }),
        );
        expect(
            await screen.findByRole('heading', { name: 'Sign in' }),
        ).toBeInTheDocument();
    });
});
