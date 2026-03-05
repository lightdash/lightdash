import { getItemId, isDateItem, isDimension } from '@lightdash/common';
import { type VegaFieldType } from '../types/types';
import { getTemplateByType, type TemplateType } from './vegaTemplates';

export const generateVegaTemplate = (
    templateType: TemplateType,
    xField: VegaFieldType | undefined,
    yField: VegaFieldType | undefined,
    extraField?: VegaFieldType,
) => {
    const templateJson = getTemplateByType(templateType);
    let templateString = JSON.stringify(templateJson, null, 2);
    if (xField) {
        const xFieldType =
            isDimension(xField) && isDateItem(xField) ? 'temporal' : 'ordinal';

        templateString = templateString.replaceAll('field_type_x', xFieldType);
        templateString = templateString.replaceAll(
            'field_x',
            getItemId(xField),
        );
    }
    if (yField)
        templateString = templateString.replaceAll(
            'field_y',
            getItemId(yField),
        );
    if (extraField)
        templateString = templateString.replaceAll(
            'field_extra',
            getItemId(extraField),
        );

    return templateString;
};
