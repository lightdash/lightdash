import { type SummaryExplore } from '@lightdash/common';
import { ActionIcon, Group, Text } from '@mantine/core';
import { IconExternalLink, IconSearch, IconTable } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import MantineLinkButton from '../../../components/common/MantineLinkButton';

type Props = {
    explore: SummaryExplore;
    tableUrl: string;
};

export const CatalogItem: FC<React.PropsWithChildren<Props>> = ({
    explore,
    tableUrl,
}) => {
    const [hovered, setHovered] = useState<boolean | undefined>(false);

    return (
        <tr
            key={explore.name}
            style={{
                height: 55,
                backgroundColor: hovered ? 'rgba(0, 0, 0, 0.05)' : undefined,
            }}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
        >
            <td>
                <MantineIcon size={'lg'} color="gray" icon={IconTable} />
            </td>
            <td>
                <Text fw={600} w={150}>
                    {explore.name}
                </Text>
            </td>
            <td>
                <Group noWrap position="apart">
                    <Text lineClamp={hovered ? undefined : 1}>
                        {explore.description}
                    </Text>
                    <Group
                        spacing="xs"
                        noWrap
                        sx={{ display: hovered ? undefined : 'none' }}
                    >
                        <MantineLinkButton
                            href={tableUrl}
                            variant="subtle"
                            target="_blank"
                            compact
                            rightIcon={<MantineIcon icon={IconExternalLink} />}
                        >
                            Use table
                        </MantineLinkButton>
                        <ActionIcon
                            sx={{ display: hovered ? undefined : 'none' }}
                        >
                            <MantineIcon icon={IconSearch} />
                        </ActionIcon>
                    </Group>
                </Group>
            </td>
        </tr>
    );
};
