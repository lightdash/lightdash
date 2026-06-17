import { defineFilterPermutationIntegrationSuite } from './filterPermutationIntegrationTestUtils';
import { filterPermutationModelConfigs } from './llmFilterPermutationRunner';

defineFilterPermutationIntegrationSuite(filterPermutationModelConfigs[0]);
