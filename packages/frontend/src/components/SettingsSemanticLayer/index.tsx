import { assertUnreachable, SemanticLayerType } from '@lightdash/common';
import { Stack, Text, Title } from '@mantine/core';
import { useState, type FC } from 'react';
import { z } from 'zod';
import { useProjectSemanticLayerUpdateMutation } from '../../hooks/useProject';
import { SettingsGridCard } from '../common/Settings/SettingsCard';
import DbtSemanticLayerForm, {
    dbtSemanticLayerFormSchema,
} from './DbtSemanticLayerForm';

interface Props {
    projectUuid: string;
}

// const SemanticLayerOptions = [
//     {
//         label: 'Cube',
//         value: SemanticLayerType.CUBE,
//     },
//     {
//         label: 'DBT',
//         value: SemanticLayerType.DBT,
//     },
// ];

const formSchemas = z.union([dbtSemanticLayerFormSchema, z.never()]);

const SettingsSemanticLayer: FC<Props> = ({ projectUuid }) => {
    const [semanticLayerType] = useState<SemanticLayerType>(
        SemanticLayerType.DBT,
    );

    const projectMutation = useProjectSemanticLayerUpdateMutation(projectUuid);

    const handleSubmit = async (
        connectionData: z.infer<typeof formSchemas>,
    ) => {
        await projectMutation.mutateAsync(connectionData);
        return false;
    };

    return (
        <SettingsGridCard>
            <Stack spacing="sm">
                <Title order={4}>Semantic Layer</Title>

                <Text color="dimmed">copy needed</Text>
            </Stack>

            <Stack>
                {/* <Select
                    label="Semantic Layer Type"
                    data={SemanticLayerOptions}
                    value={semanticLayerType}
                    onChange={(value: SemanticLayerType) =>
                        setSemanticLayerType(value)
                    }
                /> */}

                {semanticLayerType === SemanticLayerType.DBT ? (
                    <DbtSemanticLayerForm
                        isLoading={false}
                        onSubmit={handleSubmit}
                    />
                ) : semanticLayerType === SemanticLayerType.CUBE ? (
                    <>not implemented</>
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
