import { Button } from '@mantine-8/core';
import { IconChevronDown, IconChevronUp } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../common/MantineIcon';

const FormCollapseButton: FC<
    React.PropsWithChildren<{
        isSectionOpen: boolean;
        onClick: () => void;
    }>
> = ({ isSectionOpen, onClick, children }) => {
    return (
        <Button
            variant="subtle"
            color="ldGray.6"
            size="compact-sm"
            style={{
                alignSelf: 'end',
            }}
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
