with regional_sales as (

    select * from {{ ref('stg_regional_sales') }}

),

final as (

    select
        sale_id,
        sale_date,
        region,
        product_category,
        units_sold,
        revenue,
        customer_id

    from regional_sales

)

select * from final
