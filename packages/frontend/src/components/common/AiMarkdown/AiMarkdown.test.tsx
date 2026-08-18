import fs from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import { AiMarkdown } from './AiMarkdown';
import styles from './AiMarkdown.module.css';

const YAML_LINES = [
    'dimensions:',
    '  - name: order_date_with_a_rather_long_identifier',
    '    type: timestamp',
    'metrics:',
    '  - name: total_revenue',
];

const YAML_MARKDOWN = ['```yaml', ...YAML_LINES, '```'].join('\n');

// Vitest resolves CSS modules to hashed class names but doesn't apply them, so
// load the stylesheet by hand to assert against computed styles.
beforeAll(() => {
    const css = fs.readFileSync(
        path.resolve(__dirname, 'AiMarkdown.module.css'),
        'utf8',
    );
    const style = document.createElement('style');
    style.textContent = css.replaceAll('.aiMarkdown', `.${styles.aiMarkdown}`);
    document.head.appendChild(style);
});

const getCodeBlock = (container: HTMLElement) => {
    const codeBlock = container.querySelector<HTMLElement>(
        '[data-streamdown="code-block"]',
    );
    if (!codeBlock) throw new Error('No code block rendered');
    return codeBlock;
};

// Streamdown renders one span per source line and styles code blocks with
// Tailwind utilities we don't ship — including the `block` that separates those
// lines. AiMarkdown.module.css restyles the structure by data attribute
// instead; if a streamdown upgrade moves it, every line collapses onto one very
// long line that has to be scrolled horizontally, so pin it here.
describe('AiMarkdown code blocks', () => {
    it('renders a fenced block as one span per source line', () => {
        const { container } = renderWithProviders(
            <AiMarkdown>{YAML_MARKDOWN}</AiMarkdown>,
        );

        const lines =
            getCodeBlock(container).querySelectorAll('pre code > span');

        expect(Array.from(lines).map((line) => line.textContent)).toStrictEqual(
            YAML_LINES,
        );
    });

    it('lays each line out as its own block, wrapping instead of scrolling', () => {
        const { container } = renderWithProviders(
            <AiMarkdown>{YAML_MARKDOWN}</AiMarkdown>,
        );
        const codeBlock = getCodeBlock(container);

        const line = codeBlock.querySelector('pre code > span')!;
        expect(getComputedStyle(line).display).toBe('block');
        // Hanging indent so a wrapped line doesn't read as a new YAML key.
        expect(getComputedStyle(line).textIndent).toBe('-2ch');

        expect(
            getComputedStyle(codeBlock.querySelector('pre')!).whiteSpace,
        ).toBe('pre-wrap');
    });

    it('labels the block with its language', () => {
        const { container } = renderWithProviders(
            <AiMarkdown>{YAML_MARKDOWN}</AiMarkdown>,
        );

        const header = getCodeBlock(container).querySelector(
            '[data-streamdown="code-block-header"]',
        )!;

        expect(header).toHaveAttribute('data-language', 'yaml');
        expect(header).toHaveTextContent('yaml');
        expect(getComputedStyle(header).display).not.toBe('none');
    });

    it('hides the header strip for an unlabelled block', () => {
        const { container } = renderWithProviders(
            <AiMarkdown>{'```\nplain text\n```'}</AiMarkdown>,
        );

        const header = getCodeBlock(container).querySelector(
            '[data-streamdown="code-block-header"]',
        )!;

        expect(getComputedStyle(header).display).toBe('none');
    });
});
