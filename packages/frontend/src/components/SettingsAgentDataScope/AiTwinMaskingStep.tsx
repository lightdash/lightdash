import { Stack, Text } from '@mantine/core';
import { MaskingStep } from './MaskingStep';
import type { useBoundaryGuide } from './useBoundaryGuide';

export const AiTwinMaskingStep = ({
    guide,
}: {
    guide: ReturnType<typeof useBoundaryGuide>;
}) => (
    <Stack gap="sm">
        <Text fz="sm">
            Select the schemas with PII. Run the SQL to mask protected columns
            in AI user sessions.
        </Text>
        <MaskingStep
            schemas={guide.schemas}
            selectedSchemas={guide.selectedSchemas}
            setSelectedSchemas={guide.setSelectedSchemas}
            selectedSchemaSet={guide.selectedSchemaSet}
            schemaFilter={guide.schemaFilter}
            setSchemaFilter={guide.setSchemaFilter}
            tagDatabase={guide.tagDatabase}
            setTagDatabase={guide.setTagDatabase}
            tagSchema={guide.tagSchema}
            setTagSchema={guide.setTagSchema}
            maskingSql={guide.maskingSql}
            confirmed={guide.maskingConfirmed}
            setConfirmed={(value) =>
                guide.setConfirmedMaskingSql(value ? guide.maskingSql : '')
            }
        />
    </Stack>
);
