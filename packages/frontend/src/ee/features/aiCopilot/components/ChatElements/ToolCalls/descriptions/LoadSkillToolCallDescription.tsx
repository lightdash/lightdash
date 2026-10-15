import type { ServedSkillMetadata } from '@lightdash/common';
import { rem, Text } from '@mantine/core';
import type { FC } from 'react';
import { useTranslation } from 'react-i18next';
import { ToolCallChip } from '../ToolCallChip';

type Props = {
    name: string | null;
    resourceName: string | null;
    servedSkill: ServedSkillMetadata | null;
};

const getServedVersionLabel = (
    servedSkill: ServedSkillMetadata | null,
    builtInLabel: string,
) => {
    if (!servedSkill) return null;
    if (servedSkill.builtIn) return builtInLabel;
    return servedSkill.versionNumber === null
        ? null
        : `v${servedSkill.versionNumber}`;
};

export const LoadSkillToolCallDescription: FC<Props> = ({
    name,
    resourceName,
    servedSkill,
}) => {
    const { t } = useTranslation('aiCopilotChat');
    const skillName = servedSkill?.name ?? name;
    if (!skillName) return null;
    const versionLabel = getServedVersionLabel(
        servedSkill,
        t('toolDescriptions.builtIn'),
    );

    return (
        <Text c="dimmed" size="xs">
            {resourceName ? (
                <>
                    <ToolCallChip mx={rem(2)}>{resourceName}</ToolCallChip>
                    {t('toolDescriptions.from')}
                </>
            ) : null}
            <ToolCallChip mx={rem(2)}>{skillName}</ToolCallChip>
            {versionLabel}
        </Text>
    );
};
