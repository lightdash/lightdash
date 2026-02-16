import { Button, Flex, Popover, Text } from '@mantine-8/core';
import { useCallback, type FC, type PropsWithChildren } from 'react';

type Props = {
    opened: boolean;
    onClose: () => void;
    onMultiValue: () => void;
    onSingleValue: () => void;
};

const MultiValuePastePopUp: FC<PropsWithChildren<Props>> = ({
    opened,
    onClose,
    onMultiValue,
    onSingleValue,
    children,
}) => {
    const onSingleValueClick = useCallback(() => {
        onSingleValue();
        onClose();
    }, [onClose, onSingleValue]);

    const onMultiValueClick = useCallback(() => {
        onMultiValue();
        onClose();
    }, [onClose, onMultiValue]);

    return (
        <Popover
            opened={opened}
            onClose={onClose}
            position="top-start"
            withArrow
            arrowPosition="side"
        >
            <Popover.Target>{children}</Popover.Target>
            <Popover.Dropdown>
                <Text fw={500} fz="sm">
                    Multiple comma-separated values detected:
                </Text>
                <Text fz="sm">
                    Would you like to add them as single or multiple values?
                </Text>
                <Flex mt="xl" align="center" gap="sm" justify="flex-end">
                    <Button
                        variant="light"
                        size="sm"
                        onClick={onSingleValueClick}
                    >
                        Single value
                    </Button>
                    <Button
                        variant="light"
                        size="sm"
                        onClick={onMultiValueClick}
                    >
                        Multiple values
                    </Button>
                </Flex>
            </Popover.Dropdown>
        </Popover>
    );
};

export default MultiValuePastePopUp;
