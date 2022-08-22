import { FC, useEffect } from 'react';
import { FormProvider } from 'react-hook-form';
import { UseFormReturn } from 'react-hook-form/dist/types';
import {
    SubmitErrorHandler,
    SubmitHandler,
} from 'react-hook-form/dist/types/form';
import { StyledProps } from 'styled-components';
import { useTracking } from '../../providers/TrackingProvider';
import { EventName } from '../../types/Events';

interface FormProps<T extends object = any> {
    name: string;
    disableSubmitOnEnter?: boolean;
    methods: UseFormReturn<T>;
    onSubmit: SubmitHandler<T>;
    onError?: SubmitErrorHandler<T>;
}

const Form: FC<FormProps & StyledProps<any>> = ({
    name,
    disableSubmitOnEnter,
    methods,
    children,
    onSubmit,
    onError,
    ...rest
}) => {
    const { handleSubmit, formState } = methods;
    const { track } = useTracking();

    useEffect(() => {
        if (formState.isDirty) {
            // Note: we need this copy since formState is a Proxy and will send an empty objects otherwise
            const formStateCopy = {
                isDirty: formState.isDirty,
                dirtyFields: formState.dirtyFields,
                isSubmitted: formState.isSubmitted,
                isSubmitSuccessful: formState.isSubmitSuccessful,
                submitCount: formState.submitCount,
                touchedFields: formState.touchedFields,
                isSubmitting: formState.isSubmitting,
                isValidating: formState.isValidating,
                isValid: formState.isValid,
                errors: formState.errors,
            };
            track({
                name: EventName.FORM_STATE_CHANGED,
                properties: {
                    form: name,
                    formState: formStateCopy,
                },
            });
        }
    }, [formState, name, track]);
    return (
        <FormProvider {...methods}>
            <form
                onSubmit={handleSubmit(onSubmit, onError)}
                onKeyDown={(e) => {
                    const keyCode = e.keyCode ? e.keyCode : e.which;
                    if (disableSubmitOnEnter && keyCode === 13) {
                        e.preventDefault();
                    }
                }}
                {...rest}
            >
                {children}
            </form>
        </FormProvider>
    );
};

Form.defaultProps = {
    onError: undefined,
};

export default Form;
