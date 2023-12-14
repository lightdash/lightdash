import { TableCalculationFormat } from '@lightdash/common';
import { UseFormReturnType } from '@mantine/form';

type TableCalculationFormInputs = {
    name: string;
    sql: string;
    format: TableCalculationFormat;
};

export type TableCalculationForm = UseFormReturnType<
    TableCalculationFormInputs,
    (values: TableCalculationFormInputs) => TableCalculationFormInputs
>;
