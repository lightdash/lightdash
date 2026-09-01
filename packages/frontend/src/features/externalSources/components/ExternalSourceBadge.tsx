import { type ExternalSourceRef } from '@lightdash/common';
import { Badge } from '@mantine/core';
import { IconFileSpreadsheet } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { getExternalSourceTypeLabel } from '../utils/sourceTypeLabel';

export const ExternalSourceBadge: FC<{ sourceRef: ExternalSourceRef }> = ({
    sourceRef,
}) => (
    <Badge
        size="sm"
        leftSection={<MantineIcon icon={IconFileSpreadsheet} size="sm" />}
    >
        {getExternalSourceTypeLabel(sourceRef.sourceType)}
    </Badge>
);
