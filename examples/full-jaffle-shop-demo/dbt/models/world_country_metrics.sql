WITH source_data AS (
    SELECT * FROM {{ ref('raw_world_country_metrics') }}
),

final AS (
  SELECT
    country_code
    , country_name
    , continent
    , customer_count
    , annual_revenue_usd
    , avg_deal_size_usd
    , market_penetration_pct
    , yoy_growth_pct
  FROM source_data
)

SELECT * FROM final
