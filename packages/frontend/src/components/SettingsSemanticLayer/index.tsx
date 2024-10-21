import { assertUnreachable, SemanticLayerType } from '@lightdash/common';
import {
    Anchor,
    Avatar,
    Group,
    Select,
    Stack,
    Text,
    Title,
} from '@mantine/core';
import { forwardRef, useState, type FC } from 'react';
import { z } from 'zod';
import useToaster from '../../hooks/toaster/useToaster';
import {
    useProject,
    useProjectSemanticLayerDeleteMutation,
    useProjectSemanticLayerUpdateMutation,
} from '../../hooks/useProject';
import { SettingsGridCard } from '../common/Settings/SettingsCard';
import CubeLogo from './Assets/cube.svg';
import DbtLogo from './Assets/dbt.svg';
import CubeSemanticLayerForm, {
    cubeSemanticLayerFormSchema,
} from './CubeSemanticLayerForm';
import DbtSemanticLayerForm, {
    dbtSemanticLayerFormSchema,
} from './DbtSemanticLayerForm';

interface Props {
    projectUuid: string;
}

interface SemanticLayerItem extends React.ComponentPropsWithoutRef<'div'> {
    label: string;
    value: string;
    logo: string;
}

const SemanticLayerOptions: SemanticLayerItem[] = [
    {
        label: 'dbt Semantic Layer',
        value: SemanticLayerType.DBT,
        logo: DbtLogo,
    },
    {
        label: 'Cube',
        value: SemanticLayerType.CUBE,
        logo: CubeLogo,
    },
];

const SelectItemComponent = forwardRef<HTMLDivElement, SemanticLayerItem>(
    ({ logo, label, ...others }: SemanticLayerItem, ref) => (
        <div ref={ref} {...others}>
            <Group noWrap>
                <Avatar src={logo} size="xs" h="100%" />
                <Text>{label}</Text>
            </Group>
        </div>
    ),
);

const SemanticLayerLabels: Record<SemanticLayerType, string> = {
    [SemanticLayerType.CUBE]: 'Cube',
    [SemanticLayerType.DBT]: 'dbt',
};

const formSchemas = z.union([
    dbtSemanticLayerFormSchema,
    cubeSemanticLayerFormSchema,
]);

const SettingsSemanticLayer: FC<Props> = ({ projectUuid }) => {
    const { data } = useProject(projectUuid);
    const { showToastSuccess, showToastError } = useToaster();

    const [semanticLayerType, setSemanticLayerType] =
        useState<SemanticLayerType>(
            data?.semanticLayerConnection?.type ?? SemanticLayerType.DBT,
        );

    const projectMutation = useProjectSemanticLayerUpdateMutation(projectUuid);
    const deleteSemanticLayerMutation =
        useProjectSemanticLayerDeleteMutation(projectUuid);

    const handleSubmit = async (
        connectionData: z.infer<typeof formSchemas>,
    ) => {
        const { token, ...rest } = connectionData;
        try {
            await projectMutation.mutateAsync({
                ...rest,
                ...(token?.trim().length > 0 ? { token } : {}),
            });

            showToastSuccess({
                title: `Successfully updated project's semantic layer connection with ${SemanticLayerLabels[semanticLayerType]} credentials.`,
            });
        } catch (e) {
            showToastError({
                title: 'Failed saving semantic layer connection',
                ...(e.error.message ? { subtitle: e.error.message } : {}),
            });
        }

        return false;
    };

    const handleDelete = async () => {
        await deleteSemanticLayerMutation.mutateAsync();

        showToastSuccess({
            title: `Successfully deleted project's semantic layer connection.`,
        });
    };

    return (
        <SettingsGridCard>
            <Stack spacing="sm">
                <Title order={4}>Semantic Layer Integration</Title>

                <Text color="dimmed">
                    Connect your third-party Semantic Layer so you can explore
                    and report on your metric definitions in Lightdash.
                </Text>

                <Anchor
                    href="https://docs.lightdash.com/references/dbt-semantic-layer"
                    target="_blank"
                >
                    Learn more
                </Anchor>
            </Stack>

            <Stack>
                <Select
                    label="Type"
                    data={SemanticLayerOptions}
                    value={semanticLayerType}
                    itemComponent={SelectItemComponent}
                    onChange={(value: SemanticLayerType) =>
                        setSemanticLayerType(value)
                    }
                />

                {semanticLayerType === SemanticLayerType.DBT ? (
                    <DbtSemanticLayerForm
                        isLoading={projectMutation.isLoading}
                        onSubmit={handleSubmit}
                        onDelete={handleDelete}
                        semanticLayerConnection={
                            semanticLayerType ===
                            data?.semanticLayerConnection?.type
                                ? data.semanticLayerConnection
                                : undefined
                        }
                    />
                ) : semanticLayerType === SemanticLayerType.CUBE ? (
                    <CubeSemanticLayerForm
                        isLoading={false}
                        onSubmit={handleSubmit}
                        onDelete={handleDelete}
                        semanticLayerConnection={
                            semanticLayerType ===
                            data?.semanticLayerConnection?.type
                                ? data.semanticLayerConnection
                                : undefined
                        }
                    />
                ) : (
                    assertUnreachable(
                        semanticLayerType,
                        `Unknown semantic layer type: ${semanticLayerType}`,
                    )
                )}
            </Stack>
        </SettingsGridCard>
    );
};

export default SettingsSemanticLayer;
