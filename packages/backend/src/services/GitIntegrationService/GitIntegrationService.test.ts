import { GitIntegrationService } from './GitIntegrationService';

describe('GitIntegrationService.generateDiff', () => {
    it('should detect changed lines', () => {
        const original = `
      version: 2
      metrics:
        - name: unique_customer_count
          label: Unique customer count
          model: ref('customers')
          description: Total number of customers
          type: count_distinct
          sql: customer_id
      `;
        const updated = `
      version: 2
      metrics:
        - name: unique_customer_count
          label: Unique customer count
          model: ref('customers')
          description: Total number of unique customers
          type: count_distinct
          sql: customer_id
      `;
        const diff = GitIntegrationService.generateDiff(original, updated);
        expect(diff).toContain(
            '-          description: Total number of customers',
        );
        expect(diff).toContain(
            '+          description: Total number of unique customers',
        );
    });
});
