import {
    assertUnreachable,
    ExternalSourceType,
    type ExternalSourceRef,
} from '@lightdash/common';
import { Badge } from '@mantine/core';
import { IconFileSpreadsheet } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';

const getSourceTypeLabel = (sourceType: ExternalSourceType): string => {
    switch (sourceType) {
        case ExternalSourceType.CSV:
            return 'CSV file';
        case ExternalSourceType.GOOGLE_SHEETS:
            return 'Google Sheet';
        default:
            return assertUnreachable(
                sourceType,
                'Unknown external source type',
            );
    }
};

export const ExternalSourceBadge: FC<{ sourceRef: ExternalSourceRef }> = ({
    sourceRef,
}) => (
    <Badge
        variant="light"
        color="gray"
        size="sm"
        leftSection={<MantineIcon icon={IconFileSpreadsheet} size="sm" />}
    >
        {getSourceTypeLabel(sourceRef.sourceType)}
    </Badge>
);
