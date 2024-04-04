import { Box, TextInput, type TextInputProps } from '@mantine/core';
import { useHover } from '@mantine/hooks';
import { IconPencil } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../common/MantineIcon';

type Props = TextInputProps & { lighter?: boolean };

export const EditableText: FC<Props> = ({ lighter, ...props }) => {
    const { hovered, ref } = useHover();
    return (
        <Box ref={ref}>
            <TextInput
                size="xs"
                {...props}
                rightSection={
                    <MantineIcon
                        style={{
                            visibility: hovered ? 'initial' : 'hidden',
                        }}
                        color="gray.6"
                        icon={IconPencil}
                    />
                }
                styles={(theme) => ({
                    input: {
                        border: 'none',
                        background: 'transparent',
                        fontWeight: 500,
                        paddingLeft: 4,

                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',

                        ':hover': {
                            whiteSpace: 'normal',
                            overflow: 'visible',
                            background: theme.colors.gray[lighter ? '1' : '2'],
                        },

                        '::placeholder': {
                            color: theme.colors.gray[lighter ? '5' : '6'],
                        },
                    },
                })}
            />
        </Box>
    );
};
