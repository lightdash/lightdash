with country_orders as (

    select * from {{ ref('stg_country_orders') }}

),

final as (

    select
        order_id,
        order_date,
        country,
        amount

    from country_orders

)

select * from final
