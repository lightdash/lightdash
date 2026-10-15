import type { AiAgentModelConfig, AiModelOption } from '@lightdash/common';
import { Button, Stack, Text } from '@mantine/core';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import Callout from '../../../../components/common/Callout';
import type { ModelReplacement } from '../../../../components/common/ModelSelector/utils';

type Props = {
    model: AiModelOption;
    replacement: ModelReplacement | null;
    disabled: boolean;
    onSwitch: (modelConfig: AiAgentModelConfig) => void;
};

export const DeprecatedModelNotice: FC<Props> = ({
    model,
    replacement,
    disabled,
    onSwitch,
}) => {
    const { t } = useTranslation('aiAgent');
    return (
        <Callout
            variant="warning"
            title={t('deprecatedModel.retired', { name: model.displayName })}
        >
            {replacement ? (
                <Stack gap="xs" align="flex-start">
                    <Text fz="xs">
                        {t('deprecatedModel.replacementNotice', {
                            name: replacement.model.displayName,
                        })}
                    </Text>
                    <Button
                        size="compact-xs"
                        variant="default"
                        disabled={disabled}
                        onClick={() => onSwitch(replacement.modelConfig)}
                    >
                        {t('deprecatedModel.switchTo', {
                            name: replacement.model.displayName,
                        })}
                    </Button>
                </Stack>
            ) : (
                <Text fz="xs">{t('deprecatedModel.noReplacement')}</Text>
            )}
        </Callout>
    );
};
