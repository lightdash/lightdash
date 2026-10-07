import { type ParameterDefinitions } from '@lightdash/common';
import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import { type ComponentProps } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type DashboardContextType } from '../../providers/Dashboard/types';
import { DashboardFiltersBar } from './DashboardFiltersBar';

const definitions: ParameterDefinitions = {
    currency: { label: 'Currency', options: ['usd', 'eur'] },
    metric: { label: 'Metric', options: ['count'] },
};

const context = vi.hoisted(() => ({ current: {} as DashboardContextType }));

vi.mock('../../providers/Dashboard/useDashboardContext', () => ({
    default: (selector: (value: DashboardContextType) => unknown) =>
        selector(context.current),
}));
vi.mock('../../hooks/useProjectUuid', () => ({
    useProjectUuid: () => 'project-uuid',
}));
vi.mock('../../components/common/Page/useCompactContentHeader', () => ({
    useCompactContentHeader: () => false,
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
    render(
        <MantineProvider>
            <DashboardFiltersBar {...props} {...overrides} />
        </MantineProvider>,
    );

describe('DashboardFiltersBar legacy pinned parameters', () => {
    beforeEach(() => {
        context.current = {
            isAddFilterDisabled: false,
            allFilters: { dimensions: [], metrics: [], tableCalculations: [] },
            parameterDefinitions: definitions,
            parameterValues: props.parameterValues,
            pinnedParameters: props.pinnedParameters,
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
