import { screen } from '@testing-library/react';
import { type ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { emptyRollup } from '../model/rollup';
import { commonScopeSource, entry } from '../model/testFixtures';
import { LearnUiProvider } from '../scope/context';
import { renderWithMantine } from '../test/render';
import { type LearnCourse } from '../types';
import { ModulePane } from './ModulePane';

const course: LearnCourse = {
    id: 'dash',
    title: 'Dashboards',
    passingScore: 80,
    lessons: [
        { id: 'l1', title: 'Open one', html: '<p/>', scope: null },
        {
            id: 'l2',
            title: 'Edit one',
            html: '<p/>',
            scope: 'manage:Dashboard',
        },
    ],
    quiz: { questions: [] },
    demos: {},
    version: 1,
    contentHash: 'h',
    publishedAt: '2026-08-01T00:00:00.000Z',
    assetBaseUrl: '',
};
const module = {
    entry: entry({
        id: 'dash',
        scope: 'view:Dashboard',
        lessonScopes: [null, 'manage:Dashboard'],
    }),
    group: 'content' as const,
    progress: 0,
    lessonsDone: 0,
    done: false,
};
const render = (props: Partial<ComponentProps<typeof ModulePane>>) =>
    renderWithMantine(
        <LearnUiProvider scopeSource={commonScopeSource}>
            <ModulePane
                module={module}
                held={commonScopeSource.getAllScopesForRole('viewer')}
                rollup={emptyRollup()}
                course={undefined}
                courseLoading={false}
                courseError={false}
                onClose={vi.fn()}
                onOpen={vi.fn()}
                {...props}
            />
        </LearnUiProvider>,
    );

describe('ModulePane', () => {
    it('shows the loading state from props', () => {
        render({ courseLoading: true });
        expect(screen.getByText('Loading lessons…')).toBeInTheDocument();
    });
    it('shows the error state from props', () => {
        render({ courseError: true });
        expect(screen.getByText('Lessons unavailable')).toBeInTheDocument();
    });
    it('lists only the lessons the held scopes can see', () => {
        render({ course });
        expect(screen.getByText(/Open one/)).toBeInTheDocument();
        expect(screen.queryByText(/Edit one/)).not.toBeInTheDocument();
    });
});
