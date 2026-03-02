with product_costs as (

    select * from {{ ref('stg_product_costs') }}

),

final as (

    select
        cost_entry_id,
        product_name,
        category,
        region,
        quarter,
        cost_type,
        amount

    from product_costs

)

select * from final
