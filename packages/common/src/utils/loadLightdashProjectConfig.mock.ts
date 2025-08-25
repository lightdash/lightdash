/**
 * Mock YAML content for lightdash project config tests
 */

export const emptyConfig = '';

export const validConfigWithParameters = `
spotlight:
  default_visibility: show
parameters:
  test_param:
    label: Test Parameter
    options:
      - option1
      - option2
`;

export const validConfigWithOptionsFromDimension = `
spotlight:
  default_visibility: show
parameters:
  test_param:
    label: Test Parameter
    options_from_dimension:
      model: test_model
      dimension: test_dimension
`;

export const validConfigWithAllowCustomValues = `
spotlight:
  default_visibility: show
parameters:
  test_param:
    label: Test Parameter
    allow_custom_values: true
`;

export const invalidConfigWithNoOptions = `
spotlight:
  default_visibility: show
parameters:
  test_param:
    label: Test Parameter
`;

export const invalidConfigWithAllowCustomValuesFalse = `
spotlight:
  default_visibility: show
parameters:
  test_param:
    label: Test Parameter
    allow_custom_values: false
`;

export const configWithEmptyOptionsArray = `
spotlight:
  default_visibility: show
parameters:
  test_param:
    label: Test Parameter
    options: []
`;

export const invalidConfigWithIncompleteOptionsFromDimension = `
spotlight:
  default_visibility: show
parameters:
  test_param:
    label: Test Parameter
    options_from_dimension:
      model: test_model
`;

export const validConfigWithNumberParameter = `
spotlight:
  default_visibility: show
parameters:
  customer_id:
    label: Customer ID
    type: number
    default: 100
    options:
      - 100
      - 200
      - 300
`;

export const validConfigWithNumberArrayParameter = `
spotlight:
  default_visibility: show
parameters:
  product_ids:
    label: Product IDs
    type: number
    multiple: true
    default:
      - 1
      - 2
      - 3
    options:
      - 1
      - 2
      - 3
      - 4
      - 5
`;

export const validConfigWithStringTypeExplicit = `
spotlight:
  default_visibility: show
parameters:
  status:
    label: Status
    type: string
    default: active
    options:
      - active
      - inactive
      - pending
`;

export const validConfigWithMixedArrayTypes = `
spotlight:
  default_visibility: show
parameters:
  customer_name:
    label: Customer Name
    type: string
    multiple: true
    default:
      - John
      - Jane
    options:
      - John
      - Jane
      - Bob
      - Alice
`;
