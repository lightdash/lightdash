import { Group, rem, Text } from '@mantine/core';
import type { FC } from 'react';
import { useTranslation } from 'react-i18next';
import { ToolCallChip } from '../ToolCallChip';

type GrepFieldsToolCallDescriptionProps = {
    patterns: string[];
    exploreName: string | null;
};

export const GrepFieldsToolCallDescription: FC<
    GrepFieldsToolCallDescriptionProps
> = ({ patterns, exploreName }) => {
    const { t } = useTranslation('aiCopilotChat');
    return (
        <Text c="dimmed" size="xs" component="div">
            <Group
                gap={rem(4)}
                align="center"
                wrap="wrap"
                display="inline-flex"
            >
                {t('toolDescriptions.searchedFieldsMatching')}
                {patterns.map((pattern, i) => (
                    <ToolCallChip key={`${pattern}-${i}`} ff="monospace">
                        /{pattern}/
                    </ToolCallChip>
                ))}
                {exploreName ? (
                    <>
                        {t('toolDescriptions.in')}{' '}
                        <ToolCallChip>{exploreName}</ToolCallChip>
                    </>
                ) : null}
            </Group>
        </Text>
    );
};
