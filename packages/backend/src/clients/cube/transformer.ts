import { Cube, TCubeDimension, TCubeMeasure } from '@cubejs-client/core';
import {
    FieldType,
    SemanticLayerField,
    SemanticLayerView,
} from '@lightdash/common';

export const cubeTransfomers = {
    cubeFieldsToSemanticLayerFields: (
        cubeDimensions: TCubeDimension[] | TCubeMeasure[],
        cubeMetrics: TCubeDimension[] | TCubeMeasure[],
    ): SemanticLayerField[] => {
        const dimensions: SemanticLayerField[] = cubeDimensions.map((d) => ({
            name: d.name,
            label: d.title,
            type: d.type,
            description: d.shortTitle,
            visible: d.public,
            fieldType: FieldType.DIMENSION,
        }));
        const metrics: SemanticLayerField[] = cubeMetrics.map((d) => ({
            name: d.name,
            label: d.title,
            description: d.shortTitle,
            visible: d.public,
            type: d.type,
            fieldType: FieldType.METRIC,
        }));

        return [...dimensions, ...metrics];
    },
    cubesToSemanticLayerViews: (cubeViews: Cube[]): SemanticLayerView[] =>
        cubeViews.map((view) => ({
            name: view.name,
            label: view.title,
            visible: view.public,
        })),
};
