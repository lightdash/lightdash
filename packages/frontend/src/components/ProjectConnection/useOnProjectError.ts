import { friendlyName } from '@lightdash/common';
import { type FieldErrors, type SubmitErrorHandler } from 'react-hook-form';
import useToaster from '../../hooks/toaster/useToaster';
import { type ProjectConnectionForm } from './types';

export const useOnProjectError =
    (): SubmitErrorHandler<ProjectConnectionForm> => {
        const { showToastError } = useToaster();
        return async (errors: FieldErrors<ProjectConnectionForm>) => {
            if (!errors) {
                showToastError({
                    title: 'Form error',
                    subtitle: 'Unexpected error, please contact support',
                });
            } else {
                const errorMessages: string[] = Object.values(errors).reduce<
                    string[]
                >((acc, section) => {
                    const sectionErrors = Object.entries(section || {}).map(
                        ([key, { message }]) =>
                            `${friendlyName(key)}: ${message}`,
                    );
                    return [...acc, ...sectionErrors];
                }, []);
                showToastError({
                    title: 'Form errors',
                    subtitle: errorMessages.join('\n\n'),
                });
            }
        };
    };
