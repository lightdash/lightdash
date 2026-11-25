import {
    DATA_APP_ANALYSIS_INSTRUCTIONS_MAX_CHARS,
    type DashboardAiSummaryTileProperties,
    type DashboardTile,
} from '@lightdash/common';
import {
    Input,
    MultiSelect,
    SegmentedControl,
    Stack,
    Textarea,
    TextInput,
} from '@mantine/core';
import { type UseFormReturnType } from '@mantine/form';
import { useMemo, type FC } from 'react';
import { selectDashboardTiles, useDashboardSelector } from '../dashboard/store';
import { getAiSummaryCandidateTiles } from './aiSummarySources';

type AiSummaryProperties = DashboardAiSummaryTileProperties['properties'];

const chartLabel = (tile: DashboardTile): string =>
    tile.properties.title ||
    ('chartName' in tile.properties && tile.properties.chartName) ||
    'Untitled chart';

type Props = {
    form: UseFormReturnType<AiSummaryProperties>;
    /** Tab the tile sits on; only its charts can be picked */
    tabUuid: string | null;
};

const AiSummaryTileForm: FC<Props> = ({ form, tabUuid }) => {
    const tiles = useDashboardSelector(selectDashboardTiles);
    const chartOptions = useMemo(
        () =>
            getAiSummaryCandidateTiles(tabUuid, tiles ?? []).map((tile) => ({
                value: tile.uuid,
                label: chartLabel(tile),
            })),
        [tiles, tabUuid],
    );
    const { scope, instructions } = form.values;

    return (
        <Stack gap="md">
            <TextInput
                label="Title"
                placeholder="Tile title"
                required
                {...form.getInputProps('title')}
            />
            <Input.Wrapper label="Summarise">
                <SegmentedControl
                    fullWidth
                    data={[
                        { value: 'tab', label: 'All charts in this tab' },
                        { value: 'tiles', label: 'Selected charts' },
                    ]}
                    value={scope.type}
                    onChange={(value) =>
                        form.setFieldValue(
                            'scope',
                            value === 'tiles'
                                ? { type: 'tiles', tileUuids: [] }
                                : { type: 'tab' },
                        )
                    }
                />
            </Input.Wrapper>
            {scope.type === 'tiles' && (
                <MultiSelect
                    label="Charts"
                    placeholder="Pick the charts to summarise"
                    data={chartOptions}
                    value={scope.tileUuids}
                    onChange={(tileUuids) =>
                        form.setFieldValue('scope', {
                            type: 'tiles',
                            tileUuids,
                        })
                    }
                    error={form.errors.scope}
                    searchable
                />
            )}
            <Textarea
                label="Instructions"
                description="Optional. Say what to focus on and what kind of advice you want."
                placeholder="Focus on what's driving the outliers and suggest an action."
                autosize
                minRows={3}
                maxRows={8}
                maxLength={DATA_APP_ANALYSIS_INSTRUCTIONS_MAX_CHARS}
                value={instructions ?? ''}
                onChange={(event) =>
                    form.setFieldValue(
                        'instructions',
                        event.currentTarget.value || null,
                    )
                }
            />
        </Stack>
    );
};

export default AiSummaryTileForm;
