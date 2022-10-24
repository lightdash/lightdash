import { Intent } from '@blueprintjs/core';
import { Classes } from '@blueprintjs/popover2';
import React, { FC, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { useApp } from '../../providers/AppProvider';
import { isOnlyNumbers } from '../../utils/fieldValidators';
import Input from '../ReactHookForm/Input';
import { Props } from './index';
import { ApplyButton, StyledForm } from './LimitButton.styles';

const LimitForm: FC<Pick<Props, 'limit' | 'onLimitChange'>> = ({
    limit,
    onLimitChange,
}) => {
    const { health } = useApp();
    const methods = useForm<{ limit: string }>({
        mode: 'onChange',
        defaultValues: {
            limit: limit?.toString(),
        },
    });
    const {
        formState: { isValid },
    } = methods;

    const handleSubmit = useCallback(
        (data: { limit: string }) => {
            onLimitChange(parseInt(data.limit));
        },
        [onLimitChange],
    );

    if (!health.data) {
        return null;
    }
    return (
        <StyledForm
            name="query_limit"
            methods={methods}
            onSubmit={handleSubmit}
        >
            <Input
                inline
                label="Total rows:"
                name="limit"
                rules={{
                    required: 'Required field',
                    validate: {
                        isOnlyNumbers: isOnlyNumbers('Total rows'),
                    },
                    min: {
                        value: 1,
                        message: 'Minimum value: 1',
                    },
                    max: {
                        value: health.data.query.maxLimit,
                        message: `Maximum value: ${health.data.query.maxLimit}`,
                    },
                }}
            />
            <ApplyButton
                type="submit"
                intent={Intent.PRIMARY}
                className={Classes.POPOVER2_DISMISS}
                disabled={!isValid}
                text="Apply"
            />
        </StyledForm>
    );
};

export default LimitForm;
