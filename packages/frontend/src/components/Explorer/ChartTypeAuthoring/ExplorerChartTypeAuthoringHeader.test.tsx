import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import ExplorerChartTypeAuthoringHeader from './ExplorerChartTypeAuthoringHeader';

vi.mock('../../../components/common/modal/AppUpdateModal', () => ({
    default: ({ initialName }: { initialName: string }) => (
        <div role="dialog">Editing {initialName}</div>
    ),
}));
vi.mock('../../../features/apps/components/AppUpgradeModal', () => ({
    default: () => <div role="dialog">Upgrade</div>,
}));

const app = {
    appUuid: 'viz-1',
    name: 'Revenue changes waterfall',
    description: 'By tier',
};

const renderHeader = (
    overrides: Partial<
        React.ComponentProps<typeof ExplorerChartTypeAuthoringHeader>
    > = {},
) => {
    const props = {
        projectUuid: 'project-1',
        titleId: 'title',
        app,
        status: null,
        upgrade: null,
        hasHistory: true,
        isHistoryOpen: false,
        warning: null,
        onToggleHistory: vi.fn(),
        onUpgradeStarted: vi.fn(),
        onDetailsSaved: vi.fn(),
        onDone: vi.fn(),
        ...overrides,
    };
    renderWithProviders(<ExplorerChartTypeAuthoringHeader {...props} />);
    return props;
};

describe('ExplorerChartTypeAuthoringHeader', () => {
    it('names the surface with a focused heading and says nothing while describing', () => {
        renderHeader();

        const heading = screen.getByRole('heading', {
            level: 2,
            name: 'Editing chart type · Revenue changes waterfall',
        });
        expect(heading).toHaveFocus();
        expect(screen.getByRole('status')).toHaveTextContent('');
    });

    it('calls a type with no app yet a new one, with nothing to edit', () => {
        renderHeader({ app: null });

        expect(
            screen.getByRole('heading', { level: 2, name: 'New chart type' }),
        ).toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Edit chart type details' }),
        ).not.toBeInTheDocument();
    });

    it('announces a build and the version on screen', () => {
        renderHeader({ status: { kind: 'building', elapsed: '0:42' } });
        expect(screen.getByRole('status')).toHaveTextContent('Building 0:42');
    });

    it('opens the details editor on the type it shows', async () => {
        renderHeader();

        await userEvent.click(
            screen.getByRole('button', { name: 'Edit chart type details' }),
        );

        expect(screen.getByRole('dialog')).toHaveTextContent(
            'Editing Revenue changes waterfall',
        );
    });

    it('offers an upgrade only when the bundle is behind', async () => {
        const stale = {
            status: 'stale' as const,
            newFeatures: [],
            candidateFeatures: [],
            reportedSdkVersion: '1.0.0',
            reportedFeatures: [],
            disabled: false,
        };
        renderHeader({ upgrade: { ...stale, status: 'current' } });
        expect(
            screen.queryByRole('button', { name: 'Upgrade available' }),
        ).not.toBeInTheDocument();

        renderHeader({ upgrade: stale });
        await userEvent.click(
            screen.getByRole('button', { name: 'Upgrade available' }),
        );
        expect(screen.getByRole('dialog')).toHaveTextContent('Upgrade');
    });

    it('explains the type on demand and hosts the warning it is given', () => {
        renderHeader({ warning: <output>Results may be incorrect</output> });

        expect(
            screen.getByRole('button', { name: 'Chart type description' }),
        ).toBeInTheDocument();
        expect(
            screen.getByText('Results may be incorrect'),
        ).toBeInTheDocument();
    });

    it('always offers a way back and reports whether history is open', async () => {
        const props = renderHeader({ isHistoryOpen: true });

        expect(screen.getByRole('button', { name: 'History' })).toHaveAttribute(
            'aria-pressed',
            'true',
        );
        await userEvent.click(
            screen.getByRole('button', { name: 'Back to chart' }),
        );
        expect(props.onDone).toHaveBeenCalledTimes(1);
    });
});
