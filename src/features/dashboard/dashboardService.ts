import { supabase } from "../../lib/supabase";
import type { DashboardStats } from "./dashboardTypes"; // Agregamos 'type' por claridad

export async function getDashboardStats():Promise<DashboardStats>{

const [pCount,vCount,low,salesData,itemsData]=await Promise.all([
supabase.from("products").select("*",{count:"exact",head:true}).eq("is_active",true),
supabase.from("variants").select("*",{count:"exact",head:true}).eq("is_active",true),
supabase.from("variants").select(`stock,is_active,products:products(min_stock,is_active)`),
supabase.from("sales").select("total,balance"),
supabase.from("sale_items").select("profit,product_name,qty")
])

const lowStockCount=(low.data as any[]||[]).filter(x=>
x.is_active&&x.products?.is_active&&Number(x.stock)<=Number(x.products.min_stock)
).length

const revenue=(salesData.data||[]).reduce((a,b)=>a+(Number(b.total)||0),0)
const pending=(salesData.data||[]).reduce((a,b)=>a+(Number(b.balance)||0),0)
const profit=(itemsData.data||[]).reduce((a,b)=>a+(Number(b.profit)||0),0)

const by=new Map<string,number>()
;(itemsData.data||[]).forEach(i=>{
by.set(i.product_name,(by.get(i.product_name)??0)+Number(i.qty))
})

const top=Array.from(by.entries())
.map(([name,qty])=>({name,qty}))
.sort((a,b)=>b.qty-a.qty)
.slice(0,5)

return{
products:pCount.count??0,
variants:vCount.count??0,
lowStock:lowStockCount,
revenue,
profit,
pending,
operations:salesData.data?.length??0,
top
}

}

// Al final de dashboardService.ts
export const getSalesStats = getDashboardStats;