import { Button } from '@mantine/core';
import { IconChevronDown, IconChevronUp } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../common/MantineIcon';
import classes from './FormCollapseButton.module.css';

const FormCollapseButton: FC<
    React.PropsWithChildren<{
        isSectionOpen: boolean;
        onClick: () => void;
    }>
> = ({ isSectionOpen, onClick, children }) => {
    return (
        <Button
            variant="subtle"
            size="compact-sm"
            className={classes.button}
            leftSection={
                isSectionOpen ? (
                    <MantineIcon icon={IconChevronUp} />
                ) : (
                    <MantineIcon icon={IconChevronDown} />
                )
            }
            onClick={onClick}
        >
            {children}
        </Button>
    );
};

export default FormCollapseButton;
