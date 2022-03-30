import { Button, Intent } from '@blueprintjs/core';
import { ECHARTS_DEFAULT_COLORS } from 'common';
import React, { FC, useEffect, useState } from 'react';
import { useApp } from '../../../providers/AppProvider';
import { useTracking } from '../../../providers/TrackingProvider';
import SeriesColorPicker from '../../ChartConfigPanel/Series/SeriesColorPicker';
import {
    AppearanceColorWrapper,
    AppearancePanelWrapper,
    ColorLabel,
    ColorPalette,
    Title,
} from './AppearancePanel.styles';

const AppearanceColor: FC<{
    color: string;
    index: number;
    onChange: (value: string) => void;
}> = ({ color, index, onChange }) => {
    return (
        <AppearanceColorWrapper>
            <p>Color {index + 1}</p>
            <div style={{ display: 'flex' }}>
                <SeriesColorPicker color={color} onChange={onChange} />
                <ColorLabel>{color}</ColorLabel>
            </div>
        </AppearanceColorWrapper>
    );
};
const AppearancePanel: FC = () => {
    const { track } = useTracking();
    const { showToastSuccess } = useApp();

    let [colors, setColors] = useState<string[]>(
        ECHARTS_DEFAULT_COLORS.slice(0, 8),
    ); //[...Array(8).keys()];
    console.log('colors', colors);

    // FIXME This should trigger a render if colors change ???
    useEffect(() => {
        setColors(colors);
    }, [colors]);

    //TODO add form
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
                            setColors(colors);
                            console.log(
                                'color change',
                                index,
                                colorChange,
                                colors,
                            );
                        }}
                    />
                ))}
            </ColorPalette>
            <div style={{ flex: 1 }} />
            <Button
                style={{ alignSelf: 'flex-end', marginTop: 20 }}
                intent={Intent.PRIMARY}
                text="Update"
                loading={false}
                type="submit"
            />
        </AppearancePanelWrapper>
    );
};

export default AppearancePanel;
