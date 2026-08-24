import { type LearnCourse } from '@lightdash/common';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import type * as ReactRouter from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import { emptyRollup } from '../model';
import { LearnCoursePlayer } from './LearnCoursePlayer';

vi.mock('react-router', async () => {
    const actual = await vi.importActual<typeof ReactRouter>('react-router');
    return {
        ...actual,
        useNavigate: () => vi.fn(),
        useParams: () => ({
            projectUuid: 'project-1',
            courseId: 'saving-charts',
        }),
    };
});

const course: LearnCourse = {
    id: 'saving-charts',
    title: 'Saving charts',
    passingScore: 80,
    lessons: [
        {
            id: 'l1',
            title: 'Save a chart',
            html:
                '<p>Open the chart<a class="cit" href="#fig-1" data-hl="r1">1</a>.</p>' +
                '<div data-demo="save-chart"></div>' +
                '<span class="figwrap" id="fig-1"><img src="assets/a.png" alt="">' +
                '<span class="hlbox" data-r="r1" data-label="1 · Save" style="left:1%;top:2%;width:3%;height:4%"></span></span>',
        },
    ],
    quiz: { questions: [] },
    demos: {
        'save-chart': {
            id: 'save-chart',
            title: 'Save a chart',
            viewport: { width: 1440, height: 900 },
            steps: [
                {
                    image: 'save-1.png',
                    caption: 'Click Save.',
                    hotspot: { x: 0.5, y: 0.5, width: 0.1, height: 0.1 },
                },
                { image: 'save-2.png', caption: 'Done.', hotspot: null },
            ],
        },
    },
    version: 1,
    contentHash: 'abc',
    publishedAt: '2026-08-01T00:00:00.000Z',
    assetBaseUrl: 'https://cdn/courses/saving-charts/abc',
};

vi.mock('../hooks', () => ({
    useLearnCourse: () => ({
        data: course,
        isInitialLoading: false,
        isError: false,
    }),
    useLearnRollups: () => ({
        rollups: new Map([['saving-charts', emptyRollup()]]),
        isLoading: false,
        serverSynced: false,
    }),
    useRecordLearnEvent: () => ({ record: vi.fn() }),
    getLessonBookmark: () => null,
    setLessonBookmark: vi.fn(),
    setLastCourseId: vi.fn(),
}));

describe('LearnCoursePlayer', () => {
    it('mounts a click-through demo where the lesson left its placeholder', async () => {
        renderWithProviders(<LearnCoursePlayer />);
        await waitFor(() =>
            expect(screen.getByText('Click Save.')).toBeInTheDocument(),
        );
        const placeholder = document.querySelector(
            'div[data-demo="save-chart"]',
        );
        expect(placeholder?.textContent).toContain('1/2');
        fireEvent.click(screen.getByRole('button', { name: 'Next step' }));
        expect(screen.getByText('2/2')).toBeInTheDocument();
    });

    it('keeps the citation markup and resolves asset paths', async () => {
        renderWithProviders(<LearnCoursePlayer />);
        await waitFor(() =>
            expect(document.querySelector('a.cit')).toBeInTheDocument(),
        );
        expect(document.querySelector('.hlbox[data-r="r1"]')).not.toBeNull();
        expect(
            document.querySelector('.figwrap img')?.getAttribute('src'),
        ).toBe('https://cdn/courses/saving-charts/abc/assets/a.png');
    });
});
