import { MantineProvider } from '@mantine/core';
import type * as MantineHooks from '@mantine/hooks';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { AgentPageHeader } from './AgentPageHeader';

vi.mock('@mantine/hooks', async () => {
    const actual = await vi.importActual<typeof MantineHooks>('@mantine/hooks');
    return { ...actual, useMediaQuery: () => true };
});

describe('AgentPageHeader mobile layout', () => {
    it('leaves settings to the agent selector menu', () => {
        render(
            <MantineProvider env="test">
                <MemoryRouter>
                    <AgentPageHeader
                        leftSection={<span>Revenue analyst</span>}
                        settingsHref="/agent/edit"
                    />
                </MemoryRouter>
            </MantineProvider>,
        );

        expect(screen.queryByText('Revenue analyst')).toBeNull();
        expect(screen.queryByRole('link', { name: 'Settings' })).toBeNull();
    });
});
