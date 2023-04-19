import { Intent, Spinner } from '@blueprintjs/core';
import { subject } from '@casl/ability';
import { ECHARTS_DEFAULT_COLORS } from '@lightdash/common';
import { FC, useCallback, useEffect, useState } from 'react';
import { useOrganization } from '../../../hooks/organization/useOrganization';
import { useOrganizationUpdateMutation } from '../../../hooks/organization/useOrganizationUpdateMutation';
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
    const { isLoading: isOrgLoading, data } = useOrganization();
    const updateMutation = useOrganizationUpdateMutation();
    let [colors, setColors] = useState<string[]>(
        data?.chartColors || ECHARTS_DEFAULT_COLORS.slice(0, 8),
    );

    const update = useCallback(() => {
        if (data) {
            const { needsProject, organizationUuid, ...params } = data;
            updateMutation.mutate({
                ...params,
                chartColors: colors,
            });
        }
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
