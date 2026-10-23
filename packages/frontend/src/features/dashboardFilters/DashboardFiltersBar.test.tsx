import { type ParameterDefinitions } from '@lightdash/common';
import { MantineProvider } from '@mantine/core';
import { fireEvent, render, screen } from '@testing-library/react';
import { type ComponentProps } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type DashboardContextType } from '../../providers/Dashboard/types';
import { createDashboardTestStore } from '../../testing/dashboardStore';
import { DashboardStoreTestProvider } from '../../testing/DashboardStoreTestProvider';
import { DashboardFiltersBar } from './DashboardFiltersBar';

const definitions: ParameterDefinitions = {
    currency: { label: 'Currency', options: ['usd', 'eur'] },
    metric: { label: 'Metric', options: ['count'] },
};

const context = vi.hoisted(() => ({ current: {} as DashboardContextType }));
const compact = vi.hoisted(() => ({ current: false }));

vi.mock('../../providers/Dashboard/useDashboardContext', () => ({
    default: (selector: (value: DashboardContextType) => unknown) =>
        selector(context.current),
}));
vi.mock('../../hooks/useProjectUuid', () => ({
    useProjectUuid: () => 'project-uuid',
}));
vi.mock('../../components/common/Page/useCompactContentHeader', () => ({
    useCompactContentHeader: () => compact.current,
}));
vi.mock('../../ee/providers/Embed/useUiStrings', () => ({
    useUiStrings: () => (key: string) => key,
}));
vi.mock('../parameters/components/ParameterInput', () => ({
    ParameterInput: () => null,
}));
vi.mock('./index', () => ({ default: () => null }));
vi.mock('./FilterGroupSeparator', () => ({ default: () => null }));
vi.mock('./FilterRequirements/FilterRequirementsButton', () => ({
    default: () => null,
}));
vi.mock('../dateZoom', () => ({ DateZoom: () => null }));

const props: ComponentProps<typeof DashboardFiltersBar> = {
    isEditMode: false,
    activeTabUuid: 'currency-tab',
    hasTilesThatSupportFilters: true,
    hasDashboardTiles: true,
    parameters: definitions,
    shadowedReservedNames: [],
    parameterValues: { currency: 'usd', metric: 'count' },
    onParameterChange: vi.fn(),
    onParameterClearAll: vi.fn(),
    isParameterLoading: false,
    missingRequiredParameters: [],
    pinnedParameters: ['currency'],
    onParameterPin: vi.fn(),
    parameterOrder: ['metric', 'currency'],
    onParameterReorder: vi.fn(),
    isDateZoomDisabled: true,
    onCollapse: vi.fn(),
};

const parameterButtons = (name: RegExp | string) =>
    screen
        .queryAllByRole('button', { name })
        .filter((element) => element.tagName === 'BUTTON');

const renderBar = (overrides: Partial<typeof props> = {}) =>
    render(barElement(overrides));

const barElement = (overrides: Partial<typeof props> = {}) => (
    <DashboardStoreTestProvider
        store={createDashboardTestStore({
            parameterDefinitions: definitions,
            parameterValues: props.parameterValues,
            pinnedParameters: props.pinnedParameters,
        })}
    >
        <MantineProvider>
            <DashboardFiltersBar {...props} {...overrides} />
        </MantineProvider>
    </DashboardStoreTestProvider>
);

describe('DashboardFiltersBar legacy pinned parameters', () => {
    beforeEach(() => {
        compact.current = false;
        context.current = {
            isAddFilterDisabled: false,
            dashboard: { projectUuid: 'project-uuid' },
            setParameter: vi.fn(),
            toggleParameterPin: vi.fn(),
            setPinnedParameters: vi.fn(),
            setIsDateZoomDisabled: vi.fn(),
        } as unknown as DashboardContextType;
    });

    it.each([false, true])(
        'renders each parameter exactly once with isEditMode=%s',
        (isEditMode) => {
            renderBar({ isEditMode });

            expect(parameterButtons(/^Currency/)).toHaveLength(1);
            expect(parameterButtons('Currency is usd')).toHaveLength(1);
            expect(parameterButtons(/^Metric/)).toHaveLength(1);
        },
    );

    it('does not render a pinned parameter referenced only by another tab', () => {
        renderBar({
            activeTabUuid: 'metric-tab',
            parameters: { metric: definitions.metric },
        });

        expect(
            screen.queryByRole('button', { name: /^Currency/ }),
        ).not.toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Metric is count' }),
        ).toBeInTheDocument();
    });

    it('renders no parameter chips on a tab without parameter references', () => {
        renderBar({ parameters: {} });

        expect(
            screen.queryByRole('button', { name: /^Currency|^Metric/ }),
        ).not.toBeInTheDocument();
    });
});

describe('DashboardFiltersBar isCompactDrawerSuppressed', () => {
    beforeEach(() => {
        compact.current = true;
        context.current = {
            isAddFilterDisabled: false,
            dashboard: { projectUuid: 'project-uuid' },
            setParameter: vi.fn(),
            toggleParameterPin: vi.fn(),
            setPinnedParameters: vi.fn(),
            setIsDateZoomDisabled: vi.fn(),
        } as unknown as DashboardContextType;
    });

    const drawerButton = () =>
        screen.queryByRole('button', { name: 'filters.panel.title' });

    it('keeps the drawer button on a narrow screen by default', () => {
        renderBar();

        expect(drawerButton()).toBeInTheDocument();
        expect(parameterButtons('Currency is usd')).toHaveLength(0);
    });

    it('renders the bar in place and closes the drawer when suppressed', () => {
        const { rerender } = renderBar();
        fireEvent.click(drawerButton()!);
        expect(drawerButton()).toHaveAttribute('aria-expanded', 'true');

        rerender(barElement({ isCompactDrawerSuppressed: true }));
        expect(drawerButton()).not.toBeInTheDocument();
        expect(parameterButtons('Currency is usd')).toHaveLength(1);

        rerender(barElement());
        expect(drawerButton()).toHaveAttribute('aria-expanded', 'false');
    });
});
