import { DEFAULT_UI_STRINGS } from '@lightdash/common';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import Parameter from './Parameter';

describe('Parameter', () => {
    it('uses the supplied UI string between the label and value', () => {
        const { getByRole } = renderWithProviders(
            <Parameter
                paramKey="metric_type"
                parameter={{ label: 'Metric Type', default: 'count' }}
                value={null}
                parameterValues={{}}
                openPopoverId={undefined}
                onPopoverOpen={vi.fn()}
                onPopoverClose={vi.fn()}
                onParameterChange={vi.fn()}
                getUiString={(key) =>
                    key === 'parameters.is' ? 'es' : DEFAULT_UI_STRINGS[key]
                }
            />,
        );

        expect(
            getByRole('button', { name: 'Metric Type es count' }),
        ).toBeInTheDocument();
    });
});
