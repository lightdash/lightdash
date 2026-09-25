import { MantineProvider } from '@mantine/core';
import type * as MantineHooks from '@mantine/hooks';
import { fireEvent, render, screen } from '@testing-library/react';
import { type ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { AiAgentPageLayout } from './AiAgentPageLayout';

vi.mock('@mantine/hooks', async () => {
    const actual = await vi.importActual<typeof MantineHooks>('@mantine/hooks');
    return { ...actual, useMediaQuery: () => true };
});

vi.mock('../../../../../components/common/ResizableSplitter', () => {
    const Pane = ({ children }: { children: ReactNode }) => <>{children}</>;
    const ResizableSplitter = Object.assign(
        ({ children }: { children: ReactNode }) => <div>{children}</div>,
        { Pane },
    );

    return { default: ResizableSplitter };
});

vi.mock('../../hooks/useAiAgentArtifacts', () => ({
    useAiAgentArtifact: () => ({ data: undefined }),
}));

vi.mock('../../store/hooks', () => ({
    useAiAgentStoreDispatch: () => vi.fn(),
    useAiAgentStoreSelector: () => undefined,
}));

describe('AiAgentPageLayout mobile sidebar', () => {
    it('places agent context inside the thread drawer', async () => {
        render(
            <MantineProvider env="test">
                <MemoryRouter>
                    <AiAgentPageLayout
                        Sidebar={<div>Thread list</div>}
                        MobileSidebarHeader={<div>Revenue analyst</div>}
                    >
                        <div>Chat</div>
                    </AiAgentPageLayout>
                </MemoryRouter>
            </MantineProvider>,
        );

        expect(screen.queryByText('Revenue analyst')).toBeNull();

        fireEvent.click(
            screen.getByRole('button', { name: 'Open Ask AI sidebar' }),
        );

        expect(await screen.findByText('Revenue analyst')).toBeVisible();
        expect(screen.getByText('Thread list')).toBeVisible();
    });
});
