import {
    CustomFormatType,
    MetricType,
    NumberSeparator,
    type CustomFormat,
} from '@lightdash/common';
import { MantineProvider } from '@mantine/core';
import { useForm } from '@mantine/form';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type FC } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FormatForm } from '.';

let currentFormat: CustomFormat | undefined;

const Harness: FC = () => {
    const form = useForm<{ format: CustomFormat }>({
        initialValues: {
            format: {
                type: CustomFormatType.NUMBER,
                separator: NumberSeparator.DEFAULT,
                prefix: undefined,
                suffix: undefined,
            },
        },
    });
    currentFormat = form.values.format;

    return (
        <FormatForm
            format={form.values.format}
            formatInputProps={(path) => form.getInputProps(`format.${path}`)}
            setFormatFieldValue={(path, value) =>
                form.setFieldValue(`format.${path}`, value)
            }
            itemType={MetricType.NUMBER}
        />
    );
};

describe('FormatForm', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('keeps unset prefix controlled and unsets it when cleared', async () => {
        const consoleError = vi
            .spyOn(console, 'error')
            .mockImplementation(() => {});
        const user = userEvent.setup();
        render(
            <MantineProvider env="test">
                <Harness />
            </MantineProvider>,
        );

        const prefix = screen.getByLabelText('Prefix');
        expect(prefix).toHaveValue('');

        await user.type(prefix, '$');
        expect(currentFormat?.prefix).toBe('$');

        await user.clear(prefix);
        expect(prefix).toHaveValue('');
        expect(currentFormat?.prefix).toBeUndefined();

        const errors = consoleError.mock.calls.flat().join(' ');
        expect(errors).not.toMatch(/uncontrolled|controlled input/i);
    });
});
