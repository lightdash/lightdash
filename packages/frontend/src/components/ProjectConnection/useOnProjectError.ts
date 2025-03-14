import { friendlyName } from '@lightdash/common';
import { type FormErrors } from '@mantine/form';
import useToaster from '../../hooks/toaster/useToaster';

export const useOnProjectError = () => {
    const { showToastError } = useToaster();
    return async (errors: FormErrors) => {
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
                    ([key, { message }]) => `${friendlyName(key)}: ${message}`,
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
