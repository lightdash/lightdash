import { type HomepageConfig } from '@lightdash/common';
import { MantineProvider } from '@mantine-8/core';
import { render, screen } from '@testing-library/react';
import { PublishedHomepage } from './PublishedHomepage';

// The markdown block reads the viewer's name via useApp to interpolate {name}.
vi.mock('../../../providers/App/useApp', () => ({
    default: () => ({ user: { data: { firstName: 'Test' } } }),
}));
const mockIsAiEnabled = vi.hoisted(() => ({ value: true }));
vi.mock('./hooks/useHomepageAiEnabled', () => ({
    useHomepageAiEnabled: () => mockIsAiEnabled.value,
}));
vi.mock('./DayOneAskInput', () => ({
    DayOneAskInput: () => <div data-testid="ask-input" />,
}));
vi.mock('./blocks/useRecommendedActions', () => ({
    useRecommendedActions: () => ({ hasPendingActions: false }),
}));

afterEach(() => {
    mockIsAiEnabled.value = true;
});

const config: HomepageConfig = {
    version: 1,
    rows: [
        {
            id: 'r1',
            blocks: [
                {
                    id: 'b1',
                    type: 'markdown',
                    config: { content: '# Hello team' },
                },
            ],
        },
    ],
};

it('renders markdown blocks', () => {
    render(
        <MantineProvider>
            <PublishedHomepage config={config} projectUuid="p1" />
        </MantineProvider>,
    );
    expect(screen.getByText(/Hello team/)).toBeInTheDocument();
});

it('leaves no empty hero behind when no agent is configured', () => {
    mockIsAiEnabled.value = false;
    const { container } = render(
        <MantineProvider>
            <PublishedHomepage
                config={{
                    version: 1,
                    rows: [
                        {
                            id: 'r1',
                            blocks: [
                                {
                                    id: 'b1',
                                    type: 'ask-ai-hero',
                                    config: { showGreeting: false },
                                },
                            ],
                        },
                        ...config.rows,
                    ],
                }}
                projectUuid="p1"
            />
        </MantineProvider>,
    );
    expect(screen.queryByTestId('ask-input')).toBeNull();
    expect(container.querySelectorAll('[data-presentation]')).toHaveLength(0);
    expect(screen.getByText(/Hello team/)).toBeInTheDocument();
});
