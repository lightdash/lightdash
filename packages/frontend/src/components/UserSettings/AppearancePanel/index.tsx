import { Colors, Icon, InputGroup, Intent, Spinner } from '@blueprintjs/core';
import { subject } from '@casl/ability';
import { ECHARTS_DEFAULT_COLORS } from '@lightdash/common';
import React, { FC, useCallback, useEffect, useState } from 'react';
import { useOrganisation } from '../../../hooks/organisation/useOrganisation';
import { useOrganisationUpdateMutation } from '../../../hooks/organisation/useOrganisationUpdateMutation';
import { Can, useAbilityContext } from '../../common/Authorization';
import { StyledFormGroup } from '../../VisualizationConfigPanels/VisualizationConfigPanel.styles';
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
    disabled: boolean;
    onChange: (value: string) => void;
}

const AppearanceColor: FC<AppearanceColorProps> = ({
    color,
    index,
    onChange,
    disabled,
}) => (
    <StyledFormGroup label={`Color ${index + 1}`}>
        <InputGroup
            placeholder="Enter hex color"
            value={color}
            onChange={(e) => {
                onChange(e.target.value);
            }}
            disabled={disabled}
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
    </StyledFormGroup>
);

const AppearancePanel: FC = () => {
    const ability = useAbilityContext();
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
                        disabled={ability.cannot(
                            'update',
                            subject('Organization', {
                                organizationUuid: data?.organizationUuid,
                            }),
                        )}
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
            <Can
                I={'update'}
                this={subject('Organization', {
                    organizationUuid: data?.organizationUuid,
                })}
            >
                <SaveButton
                    intent={Intent.PRIMARY}
                    text="Save changes"
                    loading={updateMutation.isLoading}
                    onClick={update}
                />
            </Can>
        </AppearancePanelWrapper>
    );
};

export default AppearancePanel;
