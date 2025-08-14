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
