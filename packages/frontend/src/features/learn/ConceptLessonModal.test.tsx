import { MantineProvider } from '@mantine/core';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ConceptLessonModal } from './ConceptLessonModal';
describe('concept reader', () => {
    it('requires an explicit reading acknowledgment and sanitizes source HTML', () => {
        const onComplete = vi.fn();
        const onClose = vi.fn();
        render(
            <MantineProvider>
                <ConceptLessonModal
                    completed={false}
                    onClose={onClose}
                    onComplete={onComplete}
                    lesson={{
                        title: 'Read a workflow',
                        coveredScopes: ['view:Example'],
                        sections: [
                            {
                                heading: 'A workflow',
                                body: 'Safe **text** <script>window.bad = true</script><img src="x" onerror="alert(1)">',
                                sourceUrl: 'https://docs.lightdash.com/example',
                                sourceLabel: 'Example',
                                sourceHash: 'hash',
                            },
                        ],
                    }}
                />
            </MantineProvider>,
        );
        expect(onComplete).not.toHaveBeenCalled();
        expect(screen.getByText('Concept lesson')).toBeInTheDocument();
        expect(document.querySelector('script')).toBeNull();
        expect(document.querySelector('[onerror]')).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        expect(onClose).toHaveBeenCalledOnce();
        expect(onComplete).not.toHaveBeenCalled();
        fireEvent.click(
            screen.getByRole('button', { name: 'I have read this lesson' }),
        );
        expect(onComplete).toHaveBeenCalledOnce();
    });
});
