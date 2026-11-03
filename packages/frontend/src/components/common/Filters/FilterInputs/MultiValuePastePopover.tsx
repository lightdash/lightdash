import { Button, Flex, Popover, Text } from '@mantine/core';
import { useWindowEvent } from '@mantine/hooks';
import { useCallback, type FC, type PropsWithChildren } from 'react';
import { useUiStrings } from '../../../../ee/providers/Embed/useUiStrings';

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
    const getUiString = useUiStrings();
    // Focus stays in the caller's input, so the dropdown's own Escape never fires
    useWindowEvent('keydown', (event) => {
        if (opened && event.key === 'Escape' && !event.defaultPrevented)
            onClose();
    });
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
            onChange={(isOpened) => {
                if (!isOpened) onClose();
            }}
            position="top-start"
            withArrow
            arrowPosition="side"
        >
            <Popover.Target>{children}</Popover.Target>
            <Popover.Dropdown>
                <Text fw={500} fz="sm">
                    {getUiString('filters.inputs.pasteDetected')}
                </Text>
                <Text fz="sm">
                    {getUiString('filters.inputs.pasteQuestion')}
                </Text>
                <Flex mt="xl" align="center" gap="sm" justify="flex-end">
                    <Button
                        variant="light"
                        size="sm"
                        onClick={onSingleValueClick}
                    >
                        {getUiString('filters.inputs.singleValue')}
                    </Button>
                    <Button
                        variant="light"
                        size="sm"
                        onClick={onMultiValueClick}
                    >
                        {getUiString('filters.inputs.multipleValues')}
                    </Button>
                </Flex>
            </Popover.Dropdown>
        </Popover>
    );
};

export default MultiValuePastePopUp;
