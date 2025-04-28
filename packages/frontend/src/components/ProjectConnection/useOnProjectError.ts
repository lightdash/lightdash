import { friendlyName } from '@lightdash/common';
import { type FormErrors } from '@mantine/form';
import useToaster from '../../hooks/toaster/useToaster';

export const useOnProjectError = () => {
    const { showToastError } = useToaster();
    return (errors: FormErrors) => {
        if (!errors) {
            showToastError({
                title: 'Form error',
                subtitle: 'Unexpected error, please contact support',
            });
        } else {
            const errorMessages: string[] = Object.entries(errors).reduce<any>(
                (acc, [field, message]) => {
                    const parts = field.split('.');
                    if (parts.length === 1) {
                        return [...acc, message?.toString()];
                    }
                    const [section, _key] = parts;

                    return [...acc, `${friendlyName(section)}: ${message}`];
                },
                [],
            );
            showToastError({
                title: 'Form errors',
                subtitle: errorMessages.join('\n\n'),
            });
        }
    };
};
