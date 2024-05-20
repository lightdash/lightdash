import { type SummaryExplore } from '@lightdash/common';
import { ActionIcon, Button } from '@mantine/core';
import { IconSearch, IconTable } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../common/MantineIcon';

type Props = {
    explore: SummaryExplore;
    onClick: () => void;
};

export const CatalogItem: FC<React.PropsWithChildren<Props>> = ({
    explore,
    onClick,
}) => {
    return (
        <tr>
            <td>
                <MantineIcon icon={IconTable} />
            </td>
            <td>{explore.name}</td>
            <td>{explore.description}</td>
            <td>
                <Button onClick={onClick}>Use table</Button>
            </td>
            <td>
                {' '}
                <ActionIcon>
                    <MantineIcon icon={IconSearch} />
                </ActionIcon>
            </td>
        </tr>
    );
};
