import { type HomepageConfig } from '@lightdash/common';
import { MantineProvider } from '@mantine-8/core';
import { render, screen } from '@testing-library/react';
import { PublishedHomepage } from './PublishedHomepage';

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
