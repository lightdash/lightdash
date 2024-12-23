import {
    CustomFormatType,
    getCustomFormat,
    getItemId,
    getItemLabel,
    NumberSeparator,
    type CustomFormat,
} from '@lightdash/common';
import { Button, Modal, Stack, Title } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useCallback, useEffect } from 'react';
import { type ValueOf } from 'type-fest';
import useExplorerContext from '../../../providers/Explorer/useExplorerContext';
import { FormatForm } from '../FormatForm';

const DEFAULT_FORMAT: CustomFormat = {
    type: CustomFormatType.DEFAULT,
    round: undefined,
    separator: NumberSeparator.DEFAULT,
    currency: undefined,
    compact: undefined,
    prefix: undefined,
    suffix: undefined,
};

export const FormatModal = () => {
    const { isOpen, metric } = useExplorerContext(
        (context) => context.state.modals.format,
    );
    const metricOverrides = useExplorerContext(
        (context) =>
            context.state.unsavedChartVersion.metricQuery.metricOverrides,
    );
    const toggleModal = useExplorerContext(
        (context) => context.actions.toggleFormatModal,
    );

    const updateMetricFormat = useExplorerContext(
        (context) => context.actions.updateMetricFormat,
    );

    const form = useForm<{ format: CustomFormat }>({
        validateInputOnChange: true,
        initialValues: {
            format: DEFAULT_FORMAT,
        },
    });

    const { setFieldValue } = form;

    useEffect(() => {
        if (metric) {
            let metricFormat = getCustomFormat(metric);
            const override = metricOverrides
                ? metricOverrides[getItemId(metric)]
                : undefined;
            if (metricFormat || override) {
                setFieldValue('format', {
                    ...DEFAULT_FORMAT,
                    ...metricFormat,
                    ...override?.formatOptions,
                });
            }
        }
    }, [metricOverrides, metric, setFieldValue]);

    const handleClose = useCallback(() => {
        form.reset();
        toggleModal();
    }, [form, toggleModal]);

    const handleOnSubmit = form.onSubmit((values) => {
        if (!metric) return;
        updateMetricFormat({ metric, formatOptions: values.format });
        handleClose();
    });

    const getFormatInputProps = (path: keyof CustomFormat) =>
        form.getInputProps(`format.${path}`);

    const setFormatFieldValue = (
        path: keyof CustomFormat,
        value: ValueOf<CustomFormat>,
    ) => form.setFieldValue(`format.${path}`, value);

    if (!isOpen) {
        return null;
    }

    return metric ? (
        <Modal
            size="xl"
            onClick={(e) => e.stopPropagation()}
            opened={isOpen}
            onClose={handleClose}
            title={
                <Title order={4}>Format metric "{getItemLabel(metric)}"</Title>
            }
        >
            <form onSubmit={handleOnSubmit}>
                <Stack>
                    <FormatForm
                        formatInputProps={getFormatInputProps}
                        format={form.values.format}
                        setFormatFieldValue={setFormatFieldValue}
                    />
                    <Button display="block" ml="auto" type="submit">
                        Save changes
                    </Button>
                </Stack>
            </form>
        </Modal>
    ) : null;
};
