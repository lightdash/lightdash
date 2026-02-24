import {
    Button,
    polymorphicFactory,
    type ButtonFactory,
} from '@mantine-8/core';
import styles from './sidebarButton.module.css';

export const SidebarButton = polymorphicFactory<ButtonFactory>(
    ({ className, ...props }, ref) => {
        return (
            <Button
                ref={ref}
                className={`${styles.sidebarBtn} ${className || ''}`}
                size="xs"
                variant="subtle"
                color="gray"
                {...props}
            />
        );
    },
);
