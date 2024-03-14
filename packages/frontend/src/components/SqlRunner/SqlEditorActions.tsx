import { ActionIcon, CopyButton, Flex, Tooltip } from '@mantine/core';
import {
    IconCheck,
    IconClipboard,
    IconTextWrap,
    IconTextWrapDisabled,
} from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../common/MantineIcon';

export const SqlEditorActions: FC<{
    isSoftWrapEnabled: boolean;
    clipboardContent?: string | undefined;
    onToggleSoftWrap: () => void;
}> = ({ isSoftWrapEnabled, onToggleSoftWrap, clipboardContent }) => {
    return (
        <Flex
            pos="absolute"
            bottom={0}
            right={0}
            // Avoids potential collision with ScrollArea scrollbar:
            mr={5}
        >
            <Tooltip
                label={
                    isSoftWrapEnabled
                        ? 'Disable editor soft-wrapping'
                        : 'Enable editor soft-wrapping'
                }
                withArrow
                position="left"
            >
                <ActionIcon onClick={onToggleSoftWrap} color="gray">
                    {isSoftWrapEnabled ? (
                        <MantineIcon icon={IconTextWrapDisabled} />
                    ) : (
                        <MantineIcon icon={IconTextWrap} />
                    )}
                </ActionIcon>
            </Tooltip>
            <CopyButton value={clipboardContent ?? ''} timeout={2000}>
                {({ copied, copy }) => (
                    <Tooltip
                        label={copied ? 'Copied to clipboard!' : 'Copy'}
                        withArrow
                        position="right"
                        color={copied ? 'green' : 'dark'}
                    >
                        <ActionIcon
                            color={copied ? 'teal' : 'gray'}
                            onClick={copy}
                        >
                            {copied ? (
                                <IconCheck size="1rem" />
                            ) : (
                                <IconClipboard size="1rem" />
                            )}
                        </ActionIcon>
                    </Tooltip>
                )}
            </CopyButton>
        </Flex>
    );
};
