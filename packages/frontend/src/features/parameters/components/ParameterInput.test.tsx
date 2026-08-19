import { type LightdashProjectParameter } from '@lightdash/common';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import { ParameterInput } from './ParameterInput';

const renderParameter = (parameter: LightdashProjectParameter) =>
    renderWithProviders(
        <ParameterInput
            paramKey="channel"
            parameter={parameter}
            value={null}
            onParameterChange={vi.fn()}
        />,
    );

const getOptionLabels = (container: HTMLElement) =>
    Array.from(container.querySelectorAll('[role="option"]')).map(
        (option) => option.textContent,
    );

describe('ParameterInput', () => {
    it('renders plain options in the order they were authored', async () => {
        const { container, getByRole } = renderParameter({
            label: 'Channel',
            options: ['Global', 'sub_channel', 'Alpha'],
        });

        await userEvent.click(getByRole('textbox'));

        expect(getOptionLabels(container)).toEqual([
            'Global',
            'sub_channel',
            'Alpha',
        ]);
    });

    it('renders labelled options in the order they were authored', async () => {
        const { container, getByRole } = renderParameter({
            label: 'Channel',
            options: [
                { label: 'Zebra', value: 'z' },
                { label: 'Apple', value: 'a' },
            ],
        });

        await userEvent.click(getByRole('textbox'));

        expect(getOptionLabels(container)).toEqual(['Zebra', 'Apple']);
    });
});
