select
    *,
    case payment_method
        when 'credit_card' then 'https://upload.wikimedia.org/wikipedia/commons/1/16/Tabler-icons_credit-card.svg'
        when 'bank_transfer' then 'https://upload.wikimedia.org/wikipedia/commons/0/07/Tabler-icons_building-bank.svg'
        when 'coupon' then 'https://upload.wikimedia.org/wikipedia/commons/8/8b/Tabler-icons_ticket.svg'
        when 'gift_card' then 'https://upload.wikimedia.org/wikipedia/commons/9/99/Tabler-icons_gift-card.svg'
    end as payment_method_icon_url
from {{ ref('stg_payments') }}
