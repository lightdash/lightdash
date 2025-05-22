import { createFormContext, type UseFormReturnType } from '@mantine/form';
import type { ProjectConnectionForm } from './types';

export type Form = UseFormReturnType<ProjectConnectionForm>;
export type FormInputProps = ReturnType<Form['getInputProps']>;
export const [FormProvider, useFormContext, useForm] =
    createFormContext<ProjectConnectionForm>();
