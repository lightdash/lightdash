import { type CatalogItem } from '@lightdash/common';
import { ActionIcon, Group, Highlight, Text } from '@mantine/core';
import { IconExternalLink, IconSearch, IconTable } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import MantineLinkButton from '../../../components/common/MantineLinkButton';

type Props = {
    catalogItem: CatalogItem;
    tableUrl: string;
    searchString?: string;
};

export const CatalogListItem: FC<React.PropsWithChildren<Props>> = ({
    catalogItem,
    tableUrl,
    searchString = '',
}) => {
    const [hovered, setHovered] = useState<boolean | undefined>(false);

    return (
        <tr
            key={catalogItem.name}
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
                <Highlight
                    fw={600}
                    w={150}
                    highlight={searchString}
                    highlightColor="violet"
                >
                    {catalogItem.name}
                </Highlight>
            </td>
            <td>
                <Group noWrap position="apart">
                    <Text lineClamp={hovered ? undefined : 1}>
                        {catalogItem.description}
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
