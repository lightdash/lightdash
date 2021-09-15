import React from 'react';
import { useForm, FormProvider } from 'react-hook-form';
import { DefaultValues, SubmitHandler } from 'react-hook-form/dist/types/form';

interface FormProps<T> {
    disabled: boolean;
    defaultValues: DefaultValues<T>;
    onSubmit: SubmitHandler<T>;
    children: JSX.Element[];
}

const Form = <T extends object>({
    disabled,
    defaultValues,
    children,
    onSubmit,
}: FormProps<T>) => {
    const methods = useForm<T>({ defaultValues });
    const { handleSubmit } = methods;

    return (
        <form onSubmit={handleSubmit(onSubmit)}>
            <FormProvider {...methods}>
                {React.Children.map(children, (child) =>
                    child.props.name
                        ? React.createElement(child.type, {
                              ...{
                                  ...child.props,
                                  disabled,
                                  key: child.props.name,
                              },
                          })
                        : child,
                )}
            </FormProvider>
        </form>
    );
};

export default Form;
