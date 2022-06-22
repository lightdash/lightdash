import { Colors, Icon, InputGroup, Intent, Spinner } from '@blueprintjs/core';
import { ECHARTS_DEFAULT_COLORS } from '@lightdash/common';
import React, { FC, useCallback, useEffect, useState } from 'react';
import { useOrganisation } from '../../../hooks/organisation/useOrganisation';
import { useOrganisationUpdateMutation } from '../../../hooks/organisation/useOrganisationUpdateMutation';
import { InputWrapper } from '../../ChartConfigPanel/ChartConfigPanel.styles';
import {
    AppearancePanelWrapper,
    ColorPalette,
    ColorSquare,
    ColorSquareInner,
    SaveButton,
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
}) => (
    <InputWrapper label={`Color ${index + 1}`}>
        <InputGroup
            placeholder="Enter hex color"
            value={color}
            onChange={(e) => {
                onChange(e.target.value);
            }}
            leftElement={
                <ColorSquare>
                    <ColorSquareInner
                        style={{
                            backgroundColor: color,
                        }}
                    >
                        {!color && <Icon icon="tint" color={Colors.GRAY3} />}
                    </ColorSquareInner>
                </ColorSquare>
            }
        />
    </InputWrapper>
);

const AppearancePanel: FC = () => {
    const { isLoading: isOrgLoading, data } = useOrganisation();
    const updateMutation = useOrganisationUpdateMutation();
    let [colors, setColors] = useState<string[]>(
        data?.chartColors || ECHARTS_DEFAULT_COLORS.slice(0, 8),
    );

    const update = useCallback(() => {
        if (data)
            updateMutation.mutate({
                ...data,
                chartColors: colors,
            });
    }, [colors, data, updateMutation]);

    useEffect(() => {
        if (data?.chartColors) {
            setColors(data.chartColors);
        }
    }, [data]);

    if (isOrgLoading) {
        return <Spinner />;
    }

    return (
        <AppearancePanelWrapper>
            <Title>Default chart colors</Title>
            <ColorPalette>
                {colors.map((color, index) => (
                    <AppearanceColor
                        key={index}
                        color={color}
                        index={index}
                        onChange={(colorChange) => {
                            setColors(
                                colors.map((c, i) =>
                                    index === i ? colorChange : c,
                                ),
                            );
                        }}
                    />
                ))}
            </ColorPalette>
            <div style={{ flex: 1 }} />
            <SaveButton
                intent={Intent.PRIMARY}
                text="Save changes"
                loading={updateMutation.isLoading}
                onClick={update}
            />
        </AppearancePanelWrapper>
    );
};

export default AppearancePanel;
