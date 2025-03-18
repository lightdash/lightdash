import {
    ActionIcon,
    Button,
    Flex,
    Input,
    Stack,
    TextInput,
} from '@mantine/core';
import { IconHelpCircle, IconPlus, IconTrash } from '@tabler/icons-react';
import get from 'lodash/get';
import { useState, type ReactNode } from 'react';
import { v4 as uuidv4 } from 'uuid';
import DocumentationHelpButton from '../../DocumentationHelpButton';
import MantineIcon from '../../common/MantineIcon';
import { useFormContext } from '../formContext';

type Props = {
    name: string;
    label: string;
    disabled?: boolean;
    documentationUrl?: string;
    labelHelp?: string | ReactNode;
};
export const MultiKeyValuePairsInput = ({
    name,
    label,
    disabled,
    documentationUrl,
    labelHelp,
}: Props) => {
    const form = useFormContext();

    const values: { id: string; key: string; value: string }[] =
        get(form.values, name) ?? [];

    const addValue = () => {
        form.insertListItem(name, {
            id: uuidv4(),
            key: '',
            value: '',
        });
    };
    const removeValue = (index: number) => {
        form.removeListItem(name, index);
    };

    const [isLabelInfoOpen, setIsLabelInfoOpen] = useState<boolean>(false);

    return (
        <Input.Wrapper
            styles={{
                label: {
                    display: 'flex',
                    alignItems: 'center',
                },
            }}
            label={
                <>
                    {label}

                    <div style={{ flex: 1 }}></div>

                    {documentationUrl && !labelHelp && (
                        <DocumentationHelpButton href={documentationUrl} />
                    )}

                    {labelHelp && (
                        <ActionIcon
                            onClick={(
                                e: React.MouseEvent<HTMLButtonElement>,
                            ) => {
                                e.preventDefault();
                                setIsLabelInfoOpen(!isLabelInfoOpen);
                            }}
                        >
                            <MantineIcon icon={IconHelpCircle} />
                        </ActionIcon>
                    )}
                </>
            }
            description={isLabelInfoOpen && labelHelp}
        >
            <Stack>
                {values.map((value, index) => (
                    <Flex key={value.id} gap="xs" align="center">
                        <TextInput
                            {...form.getInputProps(`${name}.${index}.key`)}
                            placeholder="Key"
                            disabled={disabled}
                        />

                        <TextInput
                            {...form.getInputProps(`${name}.${index}.value`)}
                            placeholder="Value"
                            disabled={disabled}
                        />

                        <ActionIcon
                            onClick={() => removeValue(index)}
                            disabled={disabled}
                        >
                            <MantineIcon icon={IconTrash} />
                        </ActionIcon>
                    </Flex>
                ))}

                <Button
                    size="sm"
                    onClick={addValue}
                    leftIcon={<MantineIcon icon={IconPlus} />}
                    disabled={disabled}
                >
                    Add variable
                </Button>
            </Stack>
        </Input.Wrapper>
    );
};
