import { Intent, Spinner } from '@blueprintjs/core';
import { subject } from '@casl/ability';
import { ECHARTS_DEFAULT_COLORS } from '@lightdash/common';
import { FC, useCallback, useEffect, useState } from 'react';
import { useOrganisation } from '../../../hooks/organisation/useOrganisation';
import { useOrganisationUpdateMutation } from '../../../hooks/organisation/useOrganisationUpdateMutation';
import { InputWrapper } from '../../ChartConfigPanel/ChartConfigPanel.styles';
import { Can, useAbilityContext } from '../../common/Authorization';
import ColorInput from '../../common/ColorInput';
import {
    AppearancePanelWrapper,
    ColorPalette,
    SaveButton,
    Title,
} from './AppearancePanel.styles';

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
                    <InputWrapper key={index} label={`Color ${index + 1}`}>
                        <ColorInput
                            placeholder="Enter hex color"
                            value={color}
                            disabled={ability.cannot(
                                'update',
                                subject('Organization', {
                                    organizationUuid: data?.organizationUuid,
                                }),
                            )}
                            onChange={(e) => {
                                setColors(
                                    colors.map((c, i) =>
                                        index === i ? e.target.value : c,
                                    ),
                                );
                            }}
                        />
                    </InputWrapper>
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
