import {
    CustomFormatType,
    NumberSeparator,
    getCustomFormat,
    getItemId,
    getItemType,
    hasFormatting,
    isDimension,
    isMetric,
    type CustomFormat,
    type Dimension,
    type Metric,
} from '@lightdash/common';
import { Button } from '@mantine-8/core';
import { useForm } from '@mantine/form';
import { IconEraser, IconPencil } from '@tabler/icons-react';
import isEqual from 'lodash/isEqual';
import { memo, useCallback, useEffect, useMemo } from 'react';
import { type ValueOf } from 'type-fest';
import {
    explorerActions,
    selectFormatModal,
    selectMetricQuery,
    useExplorerDispatch,
    useExplorerSelector,
} from '../../../features/explorer/store';
import MantineIcon from '../../common/MantineIcon';
import MantineModal from '../../common/MantineModal';
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
    const { isOpen, item } = useExplorerSelector(selectFormatModal);
    const metricQuery = useExplorerSelector(selectMetricQuery);
    const metricOverrides = metricQuery.metricOverrides;
    const dimensionOverrides = metricQuery.dimensionOverrides;

    const toggleModal = useCallback(() => {
        dispatch(explorerActions.toggleFormatModal());
    }, [dispatch]);

    const updateMetricFormat = useCallback(
        (payload: { metric: Metric; formatOptions: CustomFormat }) => {
            dispatch(explorerActions.updateMetricFormat(payload));
        },
        [dispatch],
    );

    const updateDimensionFormat = useCallback(
        (payload: { dimension: Dimension; formatOptions: CustomFormat }) => {
            dispatch(explorerActions.updateDimensionFormat(payload));
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
        if (item) {
            const itemFormat = hasFormatting(item)
                ? getCustomFormat(item)
                : undefined;

            // Get the appropriate override based on item type
            const override = isDimension(item)
                ? dimensionOverrides?.[getItemId(item)]
                : metricOverrides?.[getItemId(item)];

            if (itemFormat || override) {
                setFieldValue('format', {
                    ...DEFAULT_FORMAT,
                    ...itemFormat,
                    ...override?.formatOptions,
                });
            }
        }
    }, [metricOverrides, dimensionOverrides, item, setFieldValue]);

    const handleClose = useCallback(() => {
        form.reset();
        toggleModal();
    }, [form, toggleModal]);

    const handleOnSubmit = form.onSubmit((values) => {
        if (!item) return;
        if (isMetric(item)) {
            updateMetricFormat({ metric: item, formatOptions: values.format });
        } else if (isDimension(item)) {
            updateDimensionFormat({
                dimension: item,
                formatOptions: values.format,
            });
        }
        dispatch(explorerActions.requestQueryExecution());
        handleClose();
    });

    const getFormatInputProps = (path: keyof CustomFormat) =>
        form.getInputProps(`format.${path}`);

    const setFormatFieldValue = (
        path: keyof CustomFormat,
        value: ValueOf<CustomFormat>,
    ) => form.setFieldValue(`format.${path}`, value);

    const modalTitle = useMemo(() => {
        if (isDimension(item)) {
            return 'Format dimension';
        }
        if (isMetric(item)) {
            return 'Format metric';
        }
        return 'Format field';
    }, [item]);

    if (!isOpen || !item) {
        return null;
    }

    return (
        <MantineModal
            size="xl"
            opened
            icon={IconPencil}
            onClose={handleClose}
            title={modalTitle}
            actions={
                <Button type="submit" form="format-field-form">
                    Save changes
                </Button>
            }
            leftActions={
                !isEqual(form.values.format, DEFAULT_FORMAT) ? (
                    <Button
                        variant="default"
                        leftSection={<MantineIcon icon={IconEraser} />}
                        onClick={() =>
                            form.setValues({
                                format: DEFAULT_FORMAT,
                            })
                        }
                    >
                        Reset
                    </Button>
                ) : undefined
            }
        >
            <form id="format-field-form" onSubmit={handleOnSubmit}>
                <FormatForm
                    formatInputProps={getFormatInputProps}
                    format={form.values.format}
                    setFormatFieldValue={setFormatFieldValue}
                    itemType={item ? getItemType(item) : undefined}
                />
            </form>
        </MantineModal>
    );
});
