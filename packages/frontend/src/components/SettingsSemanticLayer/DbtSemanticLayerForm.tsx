import { SemanticLayerType } from '@lightdash/common';
import {
    Button,
    Flex,
    Group,
    PasswordInput,
    Select,
    Stack,
    TextInput,
    Tooltip,
} from '@mantine/core';
import { useForm, zodResolver } from '@mantine/form';
import { IconHelp } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import { z } from 'zod';
import MantineIcon from '../common/MantineIcon';

export const dbtSemanticLayerFormSchema = z.object({
    type: z.literal(SemanticLayerType.DBT),
    token: z.string().min(1, 'Service token is required'),
    domain: z
        .string()
        .url({ message: 'Domain must be a valid URL' })
        .min(1, 'Domain is required'),
    environmentId: z.string().min(1, 'Environment ID is required'),
});

// pre defined domains come from: https://docs.getdbt.com/docs/dbt-cloud-apis/sl-graphql#dbt-semantic-layer-graphql-api
const PRE_DEFINED_DOMAINS = [
    'https://semantic-layer.cloud.getdbt.com/api/graphql',
    'https://semantic-layer.emea.dbt.com/api/graphql',
    'https://semantic-layer.au.dbt.com/api/graphql',
];

type Props = {
    isLoading: boolean;
    onSubmit: (data: z.infer<typeof dbtSemanticLayerFormSchema>) => void;
};

const DbtSemanticLayerForm: FC<Props> = ({ isLoading, onSubmit }) => {
    const form = useForm<z.infer<typeof dbtSemanticLayerFormSchema>>({
        validate: zodResolver(dbtSemanticLayerFormSchema),
        initialValues: {
            type: SemanticLayerType.DBT,
            token: '',
            domain: '',
            environmentId: '',
        },
    });

    const [domainOptions, setDomainOptions] = useState(PRE_DEFINED_DOMAINS);

    return (
        <form onSubmit={form.onSubmit(onSubmit)}>
            <Stack>
                <PasswordInput
                    {...form.getInputProps('token')}
                    label={
                        <Group display="inline-flex" spacing="xs">
                            Service Token
                            <Tooltip
                                maw={400}
                                label="Service tokens can be found in your dbt Cloud account settings: https://cloud.getdbt.com/next/settings - token needs at least 'semantic layer only' permissions."
                                multiline
                            >
                                <MantineIcon icon={IconHelp} color="gray.6" />
                            </Tooltip>
                        </Group>
                    }
                />

                <Select
                    label="Domain"
                    data={domainOptions}
                    {...form.getInputProps('domain')}
                    placeholder="Select or type domain"
                    searchable
                    creatable
                    getCreateLabel={(value) => `+ Add custom domain "${value}"`}
                    onCreate={(item) => {
                        setDomainOptions([...domainOptions, item]);
                        return item;
                    }}
                />

                <TextInput
                    {...form.getInputProps('environmentId')}
                    label={
                        <Group display="inline-flex" spacing="xs">
                            Environment ID
                            <Tooltip
                                maw={400}
                                label="The unique identifier for the dbt production environment, you can retrieve this from the dbt Cloud URL when you navigate to Environments under Deploy. If your URL ends with .../environments/222222, your environmentId is 222222"
                                multiline
                            >
                                <MantineIcon icon={IconHelp} color="gray.6" />
                            </Tooltip>
                        </Group>
                    }
                />

                <Flex justify="end">
                    <Button
                        type="submit"
                        disabled={!form.isValid()}
                        loading={isLoading}
                    >
                        Save
                    </Button>
                </Flex>
            </Stack>
        </form>
    );
};

export default DbtSemanticLayerForm;
