import { type FC } from 'react';
import { ChartTypeBuilderPage } from './ChartTypeBuilder';

/** Chart Studio building an organization library chart type. */
const OrganizationChartTypeBuilder: FC = () => (
    <ChartTypeBuilderPage owner="organization" />
);

export default OrganizationChartTypeBuilder;
