import { ActionIcon, CopyButton, Group, Tooltip } from '@mantine-8/core';
import {
    IconCheck,
    IconClipboard,
    IconCode,
    IconTextWrap,
    IconTextWrapDisabled,
} from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../common/MantineIcon';

export const SqlEditorActions: FC<{
    isSoftWrapEnabled: boolean;
    clipboardContent?: string | undefined;
    onToggleSoftWrap: () => void;
    onFormat?: () => void;
}> = ({ isSoftWrapEnabled, onToggleSoftWrap, clipboardContent, onFormat }) => {
    return (
        <Group pos="absolute" bottom={5} right={12} gap="xxs">
            {onFormat && (
                <Tooltip label="Format SQL" withArrow position="left">
                    <ActionIcon
                        onClick={onFormat}
                        color="ldLight"
                        variant="outline"
                    >
                        <MantineIcon icon={IconCode} />
                    </ActionIcon>
                </Tooltip>
            )}
            <Tooltip
                label={
                    isSoftWrapEnabled
                        ? 'Disable editor soft-wrapping'
                        : 'Enable editor soft-wrapping'
                }
                withArrow
                position="left"
            >
                <ActionIcon
                    onClick={onToggleSoftWrap}
                    color="ldLight"
                    variant="outline"
                >
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
                            color={copied ? 'teal' : 'ldLight'}
                            onClick={copy}
                            variant="outline"
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
        </Group>
    );
};
