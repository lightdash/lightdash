import { MantineProvider } from '@mantine-8/core';
import { render, screen } from '@testing-library/react';
import { AiMarkdown } from '../../../../../components/common/AiMarkdown';
import {
    MEMORY_CITATION_ALLOWED_TAGS,
    MEMORY_CITATION_COMPONENTS,
} from './memoryCitationConfig';
import { rehypeAiAgentContentLinks } from './rehypeContentLinks';

describe('MemoryCitation', () => {
    const renderMarkdown = (markdown: string) =>
        render(
            <MantineProvider>
                <AiMarkdown
                    allowedTags={MEMORY_CITATION_ALLOWED_TAGS}
                    components={MEMORY_CITATION_COMPONENTS}
                    rehypePlugins={[rehypeAiAgentContentLinks]}
                >
                    {markdown}
                </AiMarkdown>
            </MantineProvider>,
        );

    it('renders an inline non-link chip through streaming markdown', () => {
        renderMarkdown(
            'Supported sentence.<ld-mem-cite id="net-revenue"></ld-mem-cite>',
        );

        const chip = screen.getByTitle('Memory: net-revenue');
        expect(chip).toHaveTextContent('Memory');
        expect(chip.closest('a')).toBeNull();
        expect(screen.getByText(/Supported sentence/)).toBeInTheDocument();
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
