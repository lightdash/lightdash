import type { ServedSkillMetadata } from '@lightdash/common';
import { rem, Text } from '@mantine/core';
import type { FC } from 'react';
import { ToolCallChip } from '../ToolCallChip';

type Props = {
    name: string | null;
    resourceName: string | null;
    servedSkill: ServedSkillMetadata | null;
};

const getServedVersionLabel = (servedSkill: ServedSkillMetadata | null) => {
    if (!servedSkill) return null;
    if (servedSkill.builtIn) return 'built-in';
    return servedSkill.versionNumber === null
        ? null
        : `v${servedSkill.versionNumber}`;
};

export const LoadSkillToolCallDescription: FC<Props> = ({
    name,
    resourceName,
    servedSkill,
}) => {
    const skillName = servedSkill?.name ?? name;
    if (!skillName) return null;
    const versionLabel = getServedVersionLabel(servedSkill);

    return (
        <Text c="dimmed" size="xs">
            {resourceName ? (
                <>
                    <ToolCallChip mx={rem(2)}>{resourceName}</ToolCallChip>
                    from
                </>
            ) : null}
            <ToolCallChip mx={rem(2)}>{skillName}</ToolCallChip>
            {versionLabel}
        </Text>
    );
};
