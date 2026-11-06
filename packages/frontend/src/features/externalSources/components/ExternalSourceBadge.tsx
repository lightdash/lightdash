import { type ExternalSourceRef } from '@lightdash/common';
import { Badge } from '@mantine/core';
import { type FC } from 'react';
import { DataSourceIcon } from '../../../components/common/DataSourceIcon';
import { externalSourceIconOf } from '../../../components/common/dataSourceIconOf';
import { getExternalSourceTypeLabel } from '../utils/sourceTypeLabel';

export const ExternalSourceBadge: FC<{ sourceRef: ExternalSourceRef }> = ({
    sourceRef,
}) => (
    <Badge
        size="sm"
        leftSection={
            <DataSourceIcon
                source={externalSourceIconOf(sourceRef.sourceType)}
                size={12}
                color="currentColor"
            />
        }
    >
        {getExternalSourceTypeLabel(sourceRef.sourceType)}
    </Badge>
);
