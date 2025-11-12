import { MultiSelect, Stack, Text } from '@mantine-8/core';
import { useMemo, type FC } from 'react';
import { useSpaceSummaries } from '../../../../hooks/useSpaces';

type SpaceAccessSelectProps = {
    projectUuid: string;
    value: string[];
    onChange: (value: string[]) => void;
};

export const SpaceAccessSelect: FC<SpaceAccessSelectProps> = ({
    projectUuid,
    value,
    onChange,
}) => {
    const { data: allSpaces, isLoading } = useSpaceSummaries(projectUuid, true);

    const topLevelSpaces = useMemo(() => {
        if (!allSpaces) return [];
        return allSpaces.filter((space) => !space.parentSpaceUuid);
    }, [allSpaces]);

    const spaceOptions = topLevelSpaces.map((space) => ({
        value: space.uuid,
        label: space.name,
    }));

    return (
        <Stack gap={4}>
            <MultiSelect
                variant="subtle"
                label="Space access"
                description="Agent will be able to find content only in the selected spaces and their nested spaces. Leave empty to allow access to all spaces."
                placeholder={isLoading ? 'Loading spaces...' : 'Select spaces'}
                data={spaceOptions}
                value={value}
                onChange={onChange}
                searchable
                clearable
                disabled={isLoading}
            />
            {value.length > 0 && (
                <Text fz="xs" c="dimmed">
                    {value.length} space{value.length !== 1 ? 's' : ''} selected
                </Text>
            )}
        </Stack>
    );
};
