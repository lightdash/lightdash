import { ActionIcon, Group, Tooltip } from '@mantine/core';
import {
    IconClipboard,
    IconCode,
    IconTextWrap,
    IconTextWrapDisabled,
} from '@tabler/icons-react';
import { type FC } from 'react';
import { CopyActionIcon } from '../common/CopyActionIcon';
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
                <Tooltip label="Format SQL" position="left">
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
            <CopyActionIcon
                value={clipboardContent ?? ''}
                icon={IconClipboard}
                copiedLabel="Copied to clipboard!"
                tooltipPosition="right"
                variant="outline"
            />
        </Group>
    );
};
