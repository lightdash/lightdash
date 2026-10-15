import type { ToolGetMetadataArgs } from '@lightdash/common';
import { Group, rem, Text } from '@mantine/core';
import type { FC } from 'react';
import { useTranslation } from 'react-i18next';
import { ToolCallChip } from '../ToolCallChip';

type GetMetadataToolCallDescriptionProps = {
    requests: ToolGetMetadataArgs['requests'];
};

export const GetMetadataToolCallDescription: FC<
    GetMetadataToolCallDescriptionProps
> = ({ requests }) => {
    const { t } = useTranslation('aiCopilotChat');
    const names = (requests ?? []).flatMap((request) =>
        request.type === 'explore'
            ? request.exploreIds
            : request.fields.map((field) => field.fieldId),
    );
    return (
        <Text c="dimmed" size="xs" component="div">
            <Group
                gap={rem(4)}
                align="center"
                wrap="wrap"
                display="inline-flex"
            >
                {t('toolDescriptions.readMetadataFor')}
                {names.map((name, i) => (
                    <ToolCallChip key={`${name}-${i}`} ff="monospace">
                        {name}
                    </ToolCallChip>
                ))}
            </Group>
        </Text>
    );
};
