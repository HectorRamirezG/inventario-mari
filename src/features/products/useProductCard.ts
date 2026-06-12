import { useState } from "react"
import { toast } from "react-hot-toast"
import { deleteProduct } from "./productService"

import type { Product } from "../../types/database"

export function useProductCard(product:Product,refresh:()=>void){

const [openDetails,setOpenDetails]=useState(false)
const [openVariants,setOpenVariants]=useState(false)

async function handleDelete(){

if(!confirm(`¿Seguro que quieres eliminar "${product.name}"?`))return

try{

await deleteProduct(product.id)

toast.success("Producto eliminado")

refresh()

}catch{

toast.error("No se pudo eliminar")

}

}

const variantCount=product.variants?.length??0

const totalStock=
product.variants?.reduce((acc:number,v:any)=>acc+(v.stock??0),0)??0

const margin=
product.cost&&product.price
?Math.round(((product.price-product.cost)/product.price)*100)
:null

return{

openDetails,
setOpenDetails,

openVariants,
setOpenVariants,

handleDelete,

variantCount,
totalStock,
margin

}

}