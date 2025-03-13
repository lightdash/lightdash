import { createFormContext } from '@mantine/form';
import type { ProjectConnectionForm } from './types';

export const [FormProvider, useFormContext, useForm] =
    createFormContext<ProjectConnectionForm>();
