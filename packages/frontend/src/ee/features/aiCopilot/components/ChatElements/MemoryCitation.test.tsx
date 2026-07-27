import { MantineProvider } from '@mantine-8/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { AiMarkdown } from '../../../../../components/common/AiMarkdown';
import { MemoryDetails } from '../MemoryDetails/MemoryDetails';
import {
    MEMORY_CITATION_ALLOWED_TAGS,
    MEMORY_CITATION_COMPONENTS,
} from './memoryCitationConfig';
import { rehypeAiAgentContentLinks } from './rehypeContentLinks';
import { rehypeMemoryCitationIndices } from './rehypeMemoryCitations';

vi.mock('../../hooks/useAiAgentMemory', () => ({
    useAiAgentMemory: () => ({
        isLoading: false,
        data: {
            slug: 'net-revenue-ab12cd34',
            title: 'Net revenue convention',
            rawMemory: `## Memory

**Net revenue** excludes refunds.

## Evidence

The user explicitly adopted this definition.

## Apply

Use net revenue for future revenue questions.`,
            terms: ['net revenue'],
            objects: [],
            status: 'active',
            generatedAt: '2026-07-22T00:00:00.000Z',
            citedCount: 3,
            provenance: {
                type: 'source_thread',
                source: {
                    slug: 'net-revenue',
                    hasThreadAccess: true,
                    threadUuid: 'thread-uuid',
                    agentUuid: 'agent-uuid',
                    threadTitle: 'Revenue conventions',
                    threadSummary: '**Defined** net revenue.',
                },
            },
            replacementSlug: null,
        },
    }),
}));

describe('MemoryCitation', () => {
    const renderMarkdown = (markdown: string) =>
        render(
            <QueryClientProvider client={new QueryClient()}>
                <MemoryRouter
                    initialEntries={[
                        '/projects/project-uuid/ai-agents/agent-uuid/threads/thread-uuid',
                    ]}
                >
                    <MantineProvider>
                        <Routes>
                            <Route
                                path="/projects/:projectUuid/ai-agents/:agentUuid/threads/:threadUuid"
                                element={
                                    <AiMarkdown
                                        allowedTags={
                                            MEMORY_CITATION_ALLOWED_TAGS
                                        }
                                        components={MEMORY_CITATION_COMPONENTS}
                                        rehypePlugins={[
                                            rehypeAiAgentContentLinks,
                                            rehypeMemoryCitationIndices,
                                        ]}
                                    >
                                        {markdown}
                                    </AiMarkdown>
                                }
                            />
                        </Routes>
                    </MantineProvider>
                </MemoryRouter>
            </QueryClientProvider>,
        );

    it('renders an inline numbered marker through streaming markdown', () => {
        renderMarkdown(
            'Supported sentence.<ld-mem-cite id="net-revenue"></ld-mem-cite>',
        );

        const marker = screen.getByTitle('Memory: net-revenue');
        expect(marker).toHaveTextContent('1');
        expect(marker.tagName).toBe('BUTTON');
        expect(screen.getByText(/Supported sentence/)).toBeInTheDocument();
    });

    it('increments once per unique memory in an answer', () => {
        renderMarkdown(
            'First.<ld-mem-cite id="net-revenue"></ld-mem-cite> Again.<ld-mem-cite id="net-revenue"></ld-mem-cite> Second.<ld-mem-cite id="order-status"></ld-mem-cite>',
        );

        expect(
            screen
                .getAllByTitle('Memory: net-revenue')
                .map((marker) => marker.textContent),
        ).toEqual(['1', '1']);
        expect(screen.getByTitle('Memory: order-status')).toHaveTextContent(
            '2',
        );
    });

    it('shows only the memory title on hover', async () => {
        renderMarkdown(
            'Supported sentence.<ld-mem-cite id="net-revenue"></ld-mem-cite>',
        );

        fireEvent.mouseEnter(screen.getByTitle('Memory: net-revenue'));

        expect(
            await screen.findByText('Net revenue convention'),
        ).toBeInTheDocument();
        expect(screen.queryByText('Net revenue')).not.toBeInTheDocument();
        expect(screen.getByText('View memory')).toBeInTheDocument();
    });

    it('opens full memory details in a modal', async () => {
        renderMarkdown(
            'Supported sentence.<ld-mem-cite id="net-revenue"></ld-mem-cite>',
        );

        fireEvent.mouseEnter(screen.getByTitle('Memory: net-revenue'));
        fireEvent.click(await screen.findByText('View memory'));

        const dialog = await screen.findByRole('dialog');
        expect(
            within(dialog).getByText('Net revenue convention'),
        ).toBeInTheDocument();
        expect(within(dialog).getByText('Memory')).toBeInTheDocument();
        expect(within(dialog).getByText('net revenue')).toBeInTheDocument();
        const evidenceControl = within(dialog).getByRole('button', {
            name: /Evidence/,
        });
        const applyControl = within(dialog).getByRole('button', {
            name: /Apply/,
        });
        const sourceControl = within(dialog).getByRole('button', {
            name: /Source/,
        });

        expect(evidenceControl).toHaveAttribute('aria-expanded', 'false');
        expect(applyControl).toHaveAttribute('aria-expanded', 'false');
        expect(sourceControl).toHaveAttribute('aria-expanded', 'false');
        expect(
            within(dialog).getByText('Extracted from one thread'),
        ).toBeInTheDocument();

        fireEvent.click(sourceControl);

        expect(sourceControl).toHaveAttribute('aria-expanded', 'true');
        expect(within(dialog).getByText('Defined')).toHaveAttribute(
            'data-streamdown',
            'strong',
        );
        expect(within(dialog).getByText('Citations')).toBeInTheDocument();
        expect(within(dialog).getByText('3')).toBeInTheDocument();
        expect(within(dialog).getByText('Open thread')).toBeInTheDocument();
    });

    it('does not render restricted source thread details', () => {
        render(
            <MemoryRouter>
                <MantineProvider>
                    <MemoryDetails
                        projectUuid="project-uuid"
                        agentUuid="agent-uuid"
                        memory={{
                            slug: 'net-revenue',
                            title: 'Net revenue convention',
                            rawMemory: 'Use net revenue.',
                            terms: [],
                            objects: [],
                            status: 'active',
                            generatedAt: '2026-07-22T00:00:00.000Z',
                            citedCount: 0,
                            provenance: {
                                type: 'source_thread',
                                source: {
                                    slug: 'net-revenue',
                                    hasThreadAccess: false,
                                },
                            },
                            replacementSlug: null,
                        }}
                    />
                </MantineProvider>
            </MemoryRouter>,
        );

        fireEvent.click(screen.getByRole('button', { name: /Source/ }));

        expect(screen.getByText('Source thread')).toBeInTheDocument();
        expect(
            screen.getByText(
                'Thread details are only visible to its owner and agent managers.',
            ),
        ).toBeInTheDocument();
        expect(screen.queryByText('Open thread')).not.toBeInTheDocument();
        expect(
            screen.queryByText('Private thread title'),
        ).not.toBeInTheDocument();
    });

    it('opens details without navigating when the marker is clicked', async () => {
        renderMarkdown(
            'Supported sentence.<ld-mem-cite id="net-revenue"></ld-mem-cite>',
        );

        const marker = screen.getByTitle('Memory: net-revenue');
        fireEvent.click(marker);

        expect(marker.tagName).toBe('BUTTON');
        expect(marker).not.toHaveAttribute('href');
        expect(await screen.findByRole('dialog')).toBeInTheDocument();
    });

    it('renders code-fence markers literally', () => {
        renderMarkdown(
            '```html\n<ld-mem-cite id="net-revenue"></ld-mem-cite>\n```',
        );

        expect(
            screen.queryByTitle('Memory: net-revenue'),
        ).not.toBeInTheDocument();
        expect(screen.getByText(/ld-mem-cite/)).toBeInTheDocument();
    });
});
