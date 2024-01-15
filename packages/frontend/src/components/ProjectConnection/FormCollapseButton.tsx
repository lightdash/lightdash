import { Button } from '@mantine/core';
import { IconChevronDown, IconChevronUp } from '@tabler/icons-react';
import { FC } from 'react';
import MantineIcon from '../common/MantineIcon';

const FormCollapseButton: FC<
    React.PropsWithChildren<{
        isSectionOpen: boolean;
        onClick: () => void;
    }>
> = ({ isSectionOpen, onClick, children }) => {
    return (
        <Button
            color="blue"
            variant="subtle"
            compact
            sx={{
                alignSelf: 'end',
            }}
            leftIcon={
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
