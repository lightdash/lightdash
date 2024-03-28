import { Box, TextInput, type TextInputProps } from '@mantine/core';
import { useHover } from '@mantine/hooks';
import { IconPencil } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../common/MantineIcon';

export const EditableText: FC<TextInputProps> = ({ ...props }) => {
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
                        background: hovered
                            ? theme.colors.gray['2']
                            : 'transparent',
                        fontWeight: 500,
                        paddingLeft: 4,
                    },
                })}
            />
        </Box>
    );
};
