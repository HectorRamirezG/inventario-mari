import { useEffect,useMemo,useState } from "react"
import { toast } from "react-hot-toast"

import { updateVariant } from "./productService"
import { suggestedPrices } from "../pricing/suggest"

import type { Variant } from "../../types/database"
import type { PricingConfig } from "../pricing/pricingTypes"

export function useEditVariantModal(
variant:Variant|null,
productCost:number|null,
pricingCfg:PricingConfig|null,
onClose:()=>void,
onSaved:()=>void
){

const [name,setName]=useState("")
const [sku,setSku]=useState("")
const [costOverride,setCostOverride]=useState<number|"">("")
const [saving,setSaving]=useState(false)

useEffect(()=>{

if(!variant)return

setName(variant.variant_name??"")
setSku(variant.sku??"")
setCostOverride(variant.cost_override??"")

},[variant])

const effectiveCost=useMemo(()=>{

const ov=typeof costOverride==="number"?costOverride:null

return (ov??productCost)??null

},[costOverride,productCost])

const sug=useMemo(()=>{

if(!pricingCfg||effectiveCost==null)return null

return suggestedPrices(effectiveCost,pricingCfg)

},[pricingCfg,effectiveCost])

async function save(){

if(!variant)return

if(!name.trim())
return toast.error("Pon el nombre de la variante")

setSaving(true)

try{

await updateVariant(variant.id,{
variant_name:name.trim(),
sku:sku.trim()||null,
cost_override:costOverride===""?null:Number(costOverride)
})

toast.success("Variante actualizada")

onClose()
onSaved()

}catch(e:any){

console.error(e)

toast.error(e?.message??"Error actualizando variante")

}finally{

setSaving(false)

}

}

return{

name,setName,
sku,setSku,
costOverride,setCostOverride,

saving,
save,

effectiveCost,
sug

}

}