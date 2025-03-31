import {
    ActionIcon,
    Button,
    Flex,
    Input,
    Stack,
    TextInput,
} from '@mantine/core';
import { IconHelpCircle, IconPlus, IconTrash } from '@tabler/icons-react';
import { useState, type ReactNode } from 'react';
import { useFieldArray, useFormContext } from 'react-hook-form';
import DocumentationHelpButton from '../DocumentationHelpButton';
import MantineIcon from '../common/MantineIcon';

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
    const { control } = useFormContext();
    const { fields, remove, append } = useFieldArray({ name, control });

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
                {fields.map((field, index) => (
                    <Flex key={field.id} gap="xs" align="center">
                        <TextInput
                            {...control.register(`${name}.${index}.key`)}
                            placeholder="Key"
                            disabled={disabled}
                        />

                        <TextInput
                            {...control.register(`${name}.${index}.value`)}
                            placeholder="Value"
                            disabled={disabled}
                        />

                        <ActionIcon
                            onClick={() => remove(index)}
                            disabled={disabled}
                        >
                            <MantineIcon icon={IconTrash} />
                        </ActionIcon>
                    </Flex>
                ))}

                <Button
                    size="sm"
                    onClick={() => append({ key: '', value: '' })}
                    leftIcon={<MantineIcon icon={IconPlus} />}
                    disabled={disabled}
                >
                    Add variable
                </Button>
            </Stack>
        </Input.Wrapper>
    );
};
