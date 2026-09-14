import { MantineProvider } from '@mantine/core';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { AgentSelector } from './AgentSelector';
import { type Agent } from './AgentSelectorUtils';

vi.mock('../../hooks/useAiRouter', () => ({
    useAiRouterConfig: () => ({ data: { enabled: false } }),
}));

const agents: Agent[] = [
    {
        uuid: 'first-agent',
        name: 'Revenue analyst',
        imageUrl: null,
        adminOnly: false,
    },
    {
        uuid: 'second-agent',
        name: 'Retention analyst',
        imageUrl: null,
        adminOnly: false,
    },
];

describe('agent walkthrough anchors', () => {
    it('keeps the action on the selector and exposes every agent by its current label', () => {
        const { container, rerender } = render(
            <MantineProvider>
                <MemoryRouter>
                    <AgentSelector
                        agents={agents}
                        selectedAgent={agents[0]}
                        projectUuid="training-copy"
                    />
                </MemoryRouter>
            </MantineProvider>,
        );
        const selector = container.querySelector(
            '[data-tour-anchor="agent-selector"]',
        )!;
        expect(selector).toHaveAttribute('data-tour-scope', 'view:AiAgent');
        expect(selector).toHaveAttribute('data-tour-step', '2');
        fireEvent.click(selector);
        for (const agent of agents) {
            const option = screen.getByRole('option', {
                name: new RegExp(`${agent.name}$`),
            });
            expect(option).toHaveAttribute('data-tour-anchor', 'agent-option');
            expect(option).toHaveAttribute('data-tour-value', agent.name);
            expect(option).not.toHaveAttribute('data-tour-scope');
        }

        const renamed = agents.map((agent) => ({
            ...agent,
            name: `Updated ${agent.name}`,
        }));
        rerender(
            <MantineProvider>
                <MemoryRouter>
                    <AgentSelector
                        agents={renamed}
                        selectedAgent={renamed[0]}
                        projectUuid="training-copy"
                    />
                </MemoryRouter>
            </MantineProvider>,
        );
        expect(
            container.querySelector('[data-tour-anchor="agent-selector"]'),
        ).toBe(selector);
        expect(selector).toHaveAttribute('data-tour-scope', 'view:AiAgent');
        expect(selector).toHaveAttribute('data-tour-step', '2');
        for (const agent of renamed) {
            expect(
                screen.getByRole('option', {
                    name: new RegExp(`${agent.name}$`),
                }),
            ).toHaveAttribute('data-tour-value', agent.name);
        }
    });
});
