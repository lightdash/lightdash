import { Group, UnstyledButton, type UnstyledButtonProps } from '@mantine/core';
import { type FC, type ReactNode } from 'react';
import MantineIcon, {
    type MantineIconProps,
} from '../../../../components/common/MantineIcon';

type Props = UnstyledButtonProps &
    React.ButtonHTMLAttributes<HTMLButtonElement> & {
        icon: MantineIconProps['icon'];
        children: ReactNode;
    };

const FilterButton: FC<Props> = ({ icon, children, ...props }) => {
    return (
        <UnstyledButton
            component="button"
            mt="xxs"
            fz="xs"
            fw={600}
            {...props}
            sx={(theme) => ({
                color: theme.colors.blue[6],
                '&:hover': { color: theme.colors.blue[8] },
            })}
        >
            <Group spacing="xxs" noWrap>
                <MantineIcon icon={icon} size="sm" />
                {children}
            </Group>
        </UnstyledButton>
    );
};

export default FilterButton;
