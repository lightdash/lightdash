import { Badge } from '@mantine/core';
import { type FC } from 'react';
import { useUiStrings } from '../../../ee/providers/Embed/useUiStrings';

export const RetiredModelBadge: FC = () => {
    const t = useUiStrings();
    return <Badge size="xs">{t('aiAgent.modelSelector.retired')}</Badge>;
};
