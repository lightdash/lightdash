# Jaffle Shop Demo - dbt Project

This is the dbt project used for testing Lightdash functionality, based on the classic "jaffle shop" demo data with additional models for comprehensive testing.

## Project Structure

### Data Sources
All raw data comes from CSV files in the `data/` directory:
- `raw_customers.csv` - Customer information
- `raw_orders.csv` - Order transactions  
- `raw_payments.csv` - Payment records
- `raw_subscriptions.csv` - Subscription data (1000 records)
- `raw_plan.csv` - Subscription plan definitions

**Important**: When adding new data files, use `git add -f <filename>` since these files are typically gitignored.

### Models
Each model follows dbt best practices:
- `.sql` file contains the model logic (SELECT statements with CTEs)
- `.yml` file contains schema definitions, tests, and Lightdash metadata

Key models:
- `customers.sql/.yml` - Customer dimension with lifetime metrics
- `orders.sql/.yml` - Order fact table with order-level calculations
- `subscriptions.sql/.yml` - Subscription model with realistic SaaS metrics and parameters
- `plan.sql/.yml` - Plan dimension for subscription tiers

### Lightdash Integration
- `lightdash.config.yml` - Global parameters and spotlight categories
- Model YML files contain Lightdash metadata under `config.meta`
- Dimensions, metrics, and joins are defined in the YML schema files

## Development Notes

### Data Generation
- Subscription data uses weighted distribution (40% free, 37% silver, 14% gold, 8% platinum, 2% diamond)
- Realistic duration patterns with varied subscription lengths
- MRR calculations based on plan tiers

### Model Patterns
- Use CTEs (`with` statements) for readable SQL
- Proper table aliasing when joining multiple sources
- Include both raw dimensions and calculated fields
- Add comprehensive descriptions for business users

### Testing
- Unique and not_null tests on primary keys
- Custom tests for business logic validation
- Relationships tests between fact and dimension tables

## Common Commands

```bash
# Run all models
dbt run --profiles-dir ../profiles/

# Run specific model
dbt run --select subscriptions --profiles-dir ../profiles/

# Compile to see generated SQL
dbt compile --select subscriptions --profiles-dir ../profiles/

# Run tests
dbt test --profiles-dir ../profiles/
```

## Troubleshooting

- If Lightdash dimensions aren't appearing, check that columns exist in the compiled SQL
- For cross-table references, ensure proper joins exist in the SQL model, not just YAML
- Use `git add -f` for any new data files in the `data/` directory