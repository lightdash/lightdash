import React, { FC } from 'react';
import { FormProvider } from 'react-hook-form';
import { UseFormReturn } from 'react-hook-form/dist/types';
import {
    SubmitErrorHandler,
    SubmitHandler,
} from 'react-hook-form/dist/types/form';

interface FormProps<T extends object = any> {
    methods: UseFormReturn<T>;
    onSubmit: SubmitHandler<T>;
    onError?: SubmitErrorHandler<T>;
}

const Form: FC<FormProps> = ({ methods, children, onSubmit, onError }) => {
    const { handleSubmit } = methods;

    return (
        <form onSubmit={handleSubmit(onSubmit, onError)}>
            <FormProvider {...methods}>{children}</FormProvider>
        </form>
    );
};

Form.defaultProps = {
    onError: undefined,
};

export default Form;
