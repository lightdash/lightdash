import { Button, Intent } from '@blueprintjs/core';
import { ECHARTS_DEFAULT_COLORS } from 'common';
import { FC, useState } from 'react';
import { useOrganisation } from '../../../hooks/organisation/useOrganisation';
import { useOrganisationUpdateMutation } from '../../../hooks/organisation/useOrganisationUpdateMutation';
import { useTracking } from '../../../providers/TrackingProvider';
import { EventName } from '../../../types/Events';
import SeriesColorPicker from '../../ChartConfigPanel/Series/SeriesColorPicker';
import {
    AppearanceColorWrapper,
    AppearancePanelWrapper,
    ColorLabel,
    ColorPalette,
    Title,
} from './AppearancePanel.styles';

interface AppearanceColorProps {
    color: string;
    index: number;
    onChange: (value: string) => void;
}

const AppearanceColor: FC<AppearanceColorProps> = ({
    color,
    index,
    onChange,
}) => {
    let [newColor, setNewColor] = useState<string>(color);

    return (
        <AppearanceColorWrapper>
            <p>Colour {index + 1}</p>
            <div style={{ display: 'flex' }}>
                <SeriesColorPicker
                    color={color}
                    onChange={(c) => {
                        onChange(c);
                        setNewColor(c);
                    }}
                />
                <ColorLabel
                    value={newColor}
                    onChange={(e) => {
                        onChange(e.target.value);
                        setNewColor(e.target.value);
                    }}
                />
            </div>
        </AppearanceColorWrapper>
    );
};
const AppearancePanel: FC = () => {
    const { isLoading: isOrgLoading, data } = useOrganisation();

    const updateMutation = useOrganisationUpdateMutation();
    const isLoading = updateMutation.isLoading || isOrgLoading;
    const { track } = useTracking();

    let [colors, setColors] = useState<string[]>(
        data?.chartColors || ECHARTS_DEFAULT_COLORS.slice(0, 8),
    );

    const update = () => {
        if (data) {
            updateMutation.mutate({
                ...data,
                chartColors: colors,
            });

            track({
                name: EventName.APPEARANCE_DEFAULT_CHART_COLORS_UPDATE,
            });
        }
    };

    return (
        <AppearancePanelWrapper>
            <Title>Default chart colours</Title>
            <ColorPalette>
                {colors.map((color, index) => (
                    <AppearanceColor
                        color={color}
                        index={index}
                        onChange={(colorChange) => {
                            colors[index] = colorChange;
                            setColors([...colors]);
                        }}
                    />
                ))}
            </ColorPalette>
            <div style={{ flex: 1 }} />
            <Button
                style={{ alignSelf: 'flex-end', marginTop: 20 }}
                intent={Intent.PRIMARY}
                text="Update"
                loading={isLoading}
                onClick={update}
            />
        </AppearancePanelWrapper>
    );
};

export default AppearancePanel;
