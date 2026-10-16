import { ActionIcon, Group, Tooltip } from '@mantine/core';
import {
    IconClipboard,
    IconCode,
    IconTextWrap,
    IconTextWrapDisabled,
} from '@tabler/icons-react';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { CopyActionIcon } from '../common/CopyActionIcon';
import MantineIcon from '../common/MantineIcon';

export const SqlEditorActions: FC<{
    isSoftWrapEnabled: boolean;
    clipboardContent?: string | undefined;
    onToggleSoftWrap: () => void;
    onFormat?: () => void;
}> = ({ isSoftWrapEnabled, onToggleSoftWrap, clipboardContent, onFormat }) => {
    const { t } = useTranslation('sqlRunner');
    return (
        <Group pos="absolute" bottom={5} right={12} gap="xxs">
            {onFormat && (
                <Tooltip label={t('editorActions.formatSql')} position="left">
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
                        ? t('editorActions.disableSoftWrap')
                        : t('editorActions.enableSoftWrap')
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
                copiedLabel={t('feedback.copiedToClipboard', { ns: 'common' })}
                tooltipPosition="right"
                variant="outline"
            />
        </Group>
    );
};
