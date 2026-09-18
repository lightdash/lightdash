import { fireEvent, screen, waitFor } from '@testing-library/react';
import { useContext, type MouseEventHandler } from 'react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../../testing/testUtils';
import EmbedProviderContext from '../../../../providers/Embed/context';
import { ContentReferenceLink } from './ContentReferenceLink';

const Example = ({
    kind,
    onClick,
    embedded = true,
}: {
    kind: 'chart' | 'dashboard';
    onClick: MouseEventHandler<HTMLAnchorElement>;
    embedded?: boolean;
}) => {
    const defaults = useContext(EmbedProviderContext);
    const link = (
        <ContentReferenceLink
            kind={kind}
            to={`/projects/project/${kind === 'chart' ? 'saved' : 'dashboards'}/content`}
            onClick={onClick}
        >
            Saved content
        </ContentReferenceLink>
    );
    return embedded ? (
        <EmbedProviderContext.Provider
            value={{
                ...defaults,
                projectUuid: 'project',
                embedToken: 'embed-token',
                content: { type: 'aiAgent', agentUuid: 'agent' },
            }}
        >
            {link}
        </EmbedProviderContext.Provider>
    ) : (
        link
    );
};

describe('saved content references', () => {
    it.each(['chart', 'dashboard'] as const)(
        'opens an embedded %s through an authenticated embed handoff',
        async (kind) => {
            const onClick = vi.fn();
            renderWithProviders(
                <MemoryRouter>
                    <Example kind={kind} onClick={onClick} />
                </MemoryRouter>,
                { health: { siteUrl: 'https://lightdash.example' } },
            );
            await waitFor(() =>
                expect(
                    screen.getByRole('link', { name: 'Saved content' }),
                ).toHaveAttribute(
                    'href',
                    `https://lightdash.example/embed/project/ai-agents/agent/saved-content/${kind}/content#embed-token`,
                ),
            );
            const link = screen.getByRole('link', { name: 'Saved content' });
            expect(link).toHaveAttribute('target', '_blank');
            expect(link).toHaveAttribute('rel', 'noreferrer');
            fireEvent.click(link);
            fireEvent.click(link, { ctrlKey: true });
            expect(onClick).not.toHaveBeenCalled();
        },
    );

    it('retains app navigation and preview handlers outside embedding', () => {
        const onClick = vi.fn((e) => e.preventDefault());
        renderWithProviders(
            <MemoryRouter>
                <Example kind="chart" onClick={onClick} embedded={false} />
            </MemoryRouter>,
        );
        const link = screen.getByRole('link', { name: 'Saved content' });
        expect(link).toHaveAttribute('href', '/projects/project/saved/content');
        fireEvent.click(link);
        expect(onClick).toHaveBeenCalledOnce();
    });
});
