import { MantineProvider, ScrollArea } from '@mantine-8/core';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import classes from './ScrollArea.module.css';

describe('vertical ScrollArea content', () => {
    it('uses block content without a horizontal scrollbar', () => {
        const { container } = render(
            <MantineProvider>
                <ScrollArea
                    h={100}
                    scrollbars="y"
                    classNames={{ content: classes.verticalContent }}
                >
                    <div>Scrollable content</div>
                </ScrollArea>
            </MantineProvider>,
        );

        const content = screen.getByText('Scrollable content').parentElement;
        if (!content) {
            throw new Error('ScrollArea content wrapper was not rendered');
        }

        expect(content.classList.contains(classes.verticalContent)).toBe(true);
        expect(getComputedStyle(content).display).toBe('block');
        expect(
            container.querySelector('[data-orientation="horizontal"]'),
        ).toBeNull();
    });
});
