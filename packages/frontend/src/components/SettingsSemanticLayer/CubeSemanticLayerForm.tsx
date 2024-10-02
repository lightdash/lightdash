import {
    SemanticLayerType,
    type CubeSemanticLayerConnection,
} from '@lightdash/common';
import {
    ActionIcon,
    Button,
    Flex,
    Group,
    PasswordInput,
    Stack,
    TextInput,
    Tooltip,
} from '@mantine/core';
import { useForm, zodResolver } from '@mantine/form';
import { IconHelp, IconTrash } from '@tabler/icons-react';
import { useCallback, type FC } from 'react';
import { z } from 'zod';
import MantineIcon from '../common/MantineIcon';

export const cubeSemanticLayerFormSchema = z.object({
    type: z.literal(SemanticLayerType.CUBE),
    token: z.string().min(1, 'Service token is required'),
    domain: z
        .string()
        .url({ message: 'Domain must be a valid URL' })
        .min(1, 'Domain is required'),
});

type Props = {
    isLoading: boolean;
    semanticLayerConnection?: CubeSemanticLayerConnection;
    onSubmit: (data: z.infer<typeof cubeSemanticLayerFormSchema>) => void;
    onDelete: () => void;
};

const CubeSemanticLayerForm: FC<Props> = ({
    isLoading,
    semanticLayerConnection,
    onSubmit,
    onDelete,
}) => {
    const form = useForm<z.infer<typeof cubeSemanticLayerFormSchema>>({
        validate: zodResolver(cubeSemanticLayerFormSchema),
        initialValues: {
            type: SemanticLayerType.CUBE,
            token: '',
            domain: semanticLayerConnection?.domain ?? '',
        },
    });

    const handleDelete = useCallback(async () => {
        await onDelete();
        form.setInitialValues({
            type: SemanticLayerType.CUBE,
            token: '',
            domain: '',
        });
        form.reset();
    }, [form, onDelete]);

    return (
        <form onSubmit={form.onSubmit(onSubmit)}>
            <Stack>
                <PasswordInput
                    autoComplete="off"
                    {...form.getInputProps('token')}
                    placeholder={
                        semanticLayerConnection
                            ? '**************'
                            : 'Type the token to authenticate with the Cube API'
                    }
                    label={
                        <Group display="inline-flex" spacing="xs">
                            Service Token
                            <Tooltip
                                maw={400}
                                label="The token can be found by logging into Cube, clicking on the desired deployment and then going to Integrations > API Credentials > REST API."
                                multiline
                            >
                                <MantineIcon icon={IconHelp} color="gray.6" />
                            </Tooltip>
                        </Group>
                    }
                />

                <TextInput
                    {...form.getInputProps('domain')}
                    placeholder="Type your cube deployment domain"
                    label={
                        <Group display="inline-flex" spacing="xs">
                            Domain
                            <Tooltip
                                maw={400}
                                label="The domain can be found by logging into Cube, clicking on the desired deployment and then going to Integrations > API Credentials."
                                multiline
                            >
                                <MantineIcon icon={IconHelp} color="gray.6" />
                            </Tooltip>
                        </Group>
                    }
                />

                <Flex justify="end" align="center" gap="sm">
                    <Button
                        type="submit"
                        disabled={!form.isValid()}
                        loading={isLoading}
                    >
                        Save
                    </Button>
                    <ActionIcon
                        variant="transparent"
                        onClick={handleDelete}
                        disabled={!Boolean(semanticLayerConnection)}
                        c="red"
                    >
                        <MantineIcon icon={IconTrash} size="md" />
                    </ActionIcon>
                </Flex>
            </Stack>
        </form>
    );
};

export default CubeSemanticLayerForm;
