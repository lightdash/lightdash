import { ActionIcon, HoverCard, Tooltip } from '@mantine-8/core';
import { Prism } from '@mantine/prism';
import { IconEye } from '@tabler/icons-react';
import { memo, type FC } from 'react';
import MantineIcon from '../../../../../components/common/MantineIcon';

interface ViewSqlButtonProps {
    sql?: string;
}

export const ViewSqlButton: FC<ViewSqlButtonProps> = memo(({ sql }) => {
    if (!sql) return null;

    return (
        <HoverCard
            shadow="subtle"
            radius="md"
            position="bottom-start"
            withinPortal
        >
            <HoverCard.Target>
                <Tooltip label="View SQL">
                    <ActionIcon size="sm" variant="subtle" color="ldGray.9">
                        <MantineIcon icon={IconEye} />
                    </ActionIcon>
                </Tooltip>
            </HoverCard.Target>
            <HoverCard.Dropdown p={0} maw={500}>
                <Prism
                    language="sql"
                    withLineNumbers
                    noCopy
                    styles={{
                        lineContent: {
                            fontSize: 10,
                        },
                    }}
                >
                    {sql}
                </Prism>
            </HoverCard.Dropdown>
        </HoverCard>
    );
});
