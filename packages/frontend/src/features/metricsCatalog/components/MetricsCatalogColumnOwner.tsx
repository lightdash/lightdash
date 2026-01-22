import { type CatalogField } from '@lightdash/common';
import { Group, Paper, Text, Tooltip } from '@mantine-8/core';
import { type MRT_Row } from 'mantine-react-table';
import { type FC } from 'react';
import { LightdashUserAvatar } from '../../../components/Avatar';

type Props = {
    row: MRT_Row<CatalogField>;
};

export const MetricsCatalogColumnOwner: FC<Props> = ({ row }) => {
    const owner = row.original.owner;

    if (!owner) {
        return (
            <Text
                fz="sm"
                c="ldGray.5"
                fs="italic"
                style={{ cursor: 'default' }}
            >
                Unassigned
            </Text>
        );
    }

    const displayName = `${owner.firstName} ${owner.lastName}`;

    return (
        <Tooltip label={owner.email} openDelay={300}>
            <Paper px="xs" w="fit-content" style={{ cursor: 'default' }}>
                <Group gap="two" wrap="nowrap" maw="200px">
                    <LightdashUserAvatar size={16} name={displayName} />
                    <Text fz="sm" fw={600} c="ldGray.9" truncate>
                        {displayName}
                    </Text>
                </Group>
            </Paper>
        </Tooltip>
    );
};
