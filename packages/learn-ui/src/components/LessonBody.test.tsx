import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LessonBody } from './LessonBody';

describe('LessonBody', () => {
    it('renders the html and mounts a demo into its placeholder', () => {
        render(
            <LessonBody
                html='<p>Hello</p><div data-demo="tour"></div>'
                demos={{
                    tour: {
                        id: 'tour',
                        title: 'Tour',
                        viewport: { width: 10, height: 10 },
                        steps: [
                            {
                                image: 'a.png',
                                caption: 'Step one',
                                hotspot: null,
                            },
                        ],
                    },
                }}
                assetBaseUrl="https://cdn.test/c"
            />,
        );
        expect(screen.getByText('Hello')).toBeInTheDocument();
        expect(screen.getByText('Step one')).toBeInTheDocument();
    });
    it('calls onMount with the root and runs its cleanup on html change', () => {
        const cleanup = vi.fn();
        const onMount = vi.fn(() => cleanup);
        const { rerender } = render(
            <LessonBody
                html="<p>a</p>"
                demos={{}}
                assetBaseUrl=""
                onMount={onMount}
            />,
        );
        expect(onMount).toHaveBeenCalledTimes(1);
        rerender(
            <LessonBody
                html="<p>b</p>"
                demos={{}}
                assetBaseUrl=""
                onMount={onMount}
            />,
        );
        expect(cleanup).toHaveBeenCalledTimes(1);
        expect(onMount).toHaveBeenCalledTimes(2);
    });
});
