with order_currencies as (

    select * from {{ ref('stg_order_currencies') }}

),

final as (

    select
        order_id,
        currency,
        converted_amount

    from order_currencies

)

select * from final
