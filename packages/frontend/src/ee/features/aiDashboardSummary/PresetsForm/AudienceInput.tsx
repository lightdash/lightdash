import {
    ActionIcon,
    Flex,
    Stack,
    Text,
    TextInput,
    type SystemProp,
} from '@mantine/core';
import { type GetInputPropsReturnType } from '@mantine/form/lib/types';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import {
    useCallback,
    useState,
    type CSSProperties,
    type FC,
    type KeyboardEventHandler,
} from 'react';
import MantineIcon from '../../../../components/common/MantineIcon';

type AudienceItemProps = {
    item: string;
    removeItem?: () => void;
};

const AudienceItem: FC<AudienceItemProps> = ({ item, removeItem }) => {
    return (
        <Flex gap="xs" align={'center'} justify={'center'}>
            <Text>{item}</Text>
            <ActionIcon>
                <MantineIcon icon={IconTrash} onClick={removeItem} />
            </ActionIcon>
        </Flex>
    );
};

type AudienceInputProps = {
    label?: string;
    w?: SystemProp<CSSProperties['width']>;
} & GetInputPropsReturnType;

const AudienceInput: FC<AudienceInputProps> = ({
    label,
    value: audiences,
    onChange,
    w,
}) => {
    const [inputAudience, setInputAudience] = useState<string>('');

    const addAudience = useCallback(() => {
        onChange([...audiences, inputAudience]);
        setInputAudience('');
    }, [audiences, inputAudience, onChange]);

    const removeAudience = useCallback(
        (i: number) => {
            onChange([...audiences.slice(0, i), ...audiences.slice(i + 1)]);
        },
        [audiences, onChange],
    );

    const handleKeyDown: KeyboardEventHandler<HTMLInputElement> = useCallback(
        (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                addAudience();
            }
        },
        [addAudience],
    );

    return (
        <Stack align="flex-start" w={w}>
            <Flex gap="xs" align="center" justify="flex-start" w="100%">
                <TextInput
                    label={label}
                    w="100%"
                    placeholder="Type the summary audience"
                    value={inputAudience}
                    rightSection={
                        <ActionIcon onClick={addAudience}>
                            <MantineIcon icon={IconPlus} />
                        </ActionIcon>
                    }
                    onKeyDown={handleKeyDown}
                    onChange={(e) => setInputAudience(e.target.value)}
                />
            </Flex>
            {audiences.map((item: string, index: number) => (
                <AudienceItem
                    key={index}
                    item={item}
                    removeItem={() => {
                        removeAudience(index);
                    }}
                />
            ))}
        </Stack>
    );
};

export default AudienceInput;
