import {
    CustomFormatType,
    NumberSeparator,
    getCustomFormat,
    getItemId,
    hasFormatting,
    type CustomFormat,
    type Metric,
} from '@lightdash/common';
import { Button, Group, Modal, Stack, Title } from '@mantine/core';
import { useForm } from '@mantine/form';
import isEqual from 'lodash/isEqual';
import { memo, useCallback, useEffect } from 'react';
import { type ValueOf } from 'type-fest';
import {
    explorerActions,
    selectFormatModal,
    selectMetricQuery,
    useExplorerDispatch,
    useExplorerSelector,
} from '../../../features/explorer/store';
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

export const FormatModal = memo(() => {
    const dispatch = useExplorerDispatch();
    const { isOpen, metric } = useExplorerSelector(selectFormatModal);
    const metricQuery = useExplorerSelector(selectMetricQuery);
    const metricOverrides = metricQuery.metricOverrides;

    const toggleModal = useCallback(() => {
        dispatch(explorerActions.toggleFormatModal());
    }, [dispatch]);

    const updateMetricFormat = useCallback(
        (payload: { metric: Metric; formatOptions: CustomFormat }) => {
            dispatch(explorerActions.updateMetricFormat(payload));
        },
        [dispatch],
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
            let metricFormat = hasFormatting(metric)
                ? getCustomFormat(metric)
                : undefined;
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
            title={<Title order={4}>Format metric</Title>}
        >
            <form onSubmit={handleOnSubmit}>
                <Stack>
                    <FormatForm
                        formatInputProps={getFormatInputProps}
                        format={form.values.format}
                        setFormatFieldValue={setFormatFieldValue}
                    />

                    <Group position="right" spacing="xs">
                        {!isEqual(form.values.format, DEFAULT_FORMAT) && (
                            <Button
                                variant="default"
                                onClick={() =>
                                    form.setValues({
                                        format: DEFAULT_FORMAT,
                                    })
                                }
                            >
                                Reset
                            </Button>
                        )}

                        <Button display="block" type="submit">
                            Save changes
                        </Button>
                    </Group>
                </Stack>
            </form>
        </Modal>
    ) : null;
});
