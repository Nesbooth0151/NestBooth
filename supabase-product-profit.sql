-- Jalankan sekali di Supabase SQL Editor.
-- Biaya bahan disimpan per gram/ml/pcs agar laba produk dihitung dari resep.
alter table public.materials add column if not exists unit_cost numeric not null default 0 check (unit_cost >= 0);

create or replace function public.product_profit_report(p_from date, p_to date)
returns table (
  product_name text,
  quantity numeric,
  revenue numeric,
  ingredient_cost numeric,
  gross_profit numeric,
  margin_percent numeric,
  recipe_complete boolean
)
language sql security definer set search_path = public
as $$
  with sale_lines as (
    select split_part(item->>'name', ' — ', 1) as line_name,
           nullif(split_part(item->>'name', ' — ', 2), '') as line_variant,
           greatest(0, coalesce((item->>'qty')::numeric, 0)) as line_qty,
           greatest(0, coalesce((item->>'price')::numeric, 0)) as unit_price
    from public.sales sale
    cross join lateral jsonb_array_elements(sale.items) item
    where sale.payment_status = 'paid'
      and sale.created_at >= (p_from::timestamp at time zone 'Asia/Jakarta')
      and sale.created_at < ((p_to + 1)::timestamp at time zone 'Asia/Jakarta')
  ), line_costs as (
    select line.*, product.id as product_id,
           coalesce(recipe.cost_per_portion, 0) as cost_per_portion,
           coalesce(recipe.material_count, 0) as material_count
    from sale_lines line
    left join public.products product on product.name = line.line_name
    left join lateral (
      select sum(chosen.amount * chosen.unit_cost) as cost_per_portion, count(*) as material_count
      from (
        select distinct on (recipe.material_id) recipe.amount, material.unit_cost
        from public.product_recipes recipe
        join public.materials material on material.id = recipe.material_id
        where recipe.product_id = product.id
          and (recipe.variant = '' or recipe.variant = coalesce(line.line_variant, ''))
        order by recipe.material_id,
          case when recipe.variant = coalesce(line.line_variant, '') then 0 else 1 end
      ) chosen
    ) recipe on true
  )
  select line_name as product_name,
         sum(line_qty) as quantity,
         sum(line_qty * unit_price) as revenue,
         sum(line_qty * cost_per_portion) as ingredient_cost,
         sum(line_qty * (unit_price - cost_per_portion)) as gross_profit,
         case when sum(line_qty * unit_price) = 0 then 0
              else round((sum(line_qty * (unit_price - cost_per_portion)) / sum(line_qty * unit_price)) * 100, 1) end as margin_percent,
         bool_and(product_id is not null and material_count > 0) as recipe_complete
  from line_costs
  group by line_name
  order by gross_profit desc, revenue desc, line_name;
$$;

revoke all on function public.product_profit_report(date, date) from public, anon, authenticated;
grant execute on function public.product_profit_report(date, date) to service_role;
