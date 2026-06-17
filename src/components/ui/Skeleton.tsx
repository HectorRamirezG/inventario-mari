import clsx from "clsx"

interface SkeletonProps{
className?:string
rounded?:"sm"|"md"|"lg"|"xl"|"full"
}

export default function Skeleton({className,rounded="lg"}:SkeletonProps){

const r={
sm:"rounded",
md:"rounded-md",
lg:"rounded-xl",
xl:"rounded-2xl",
full:"rounded-full"
}

return(
<div
className={clsx(
"shimmer",
r[rounded],
className
)}
aria-hidden="true"
/>
)

}

export function SkeletonText({lines=3}:{lines?:number}){
return(
<div className="space-y-2">
{Array.from({length:lines}).map((_,i)=>(
<Skeleton key={i} className={clsx("h-3",i===lines-1?"w-2/3":"w-full")} />
))}
</div>
)
}

export function SkeletonAvatar(){
return <Skeleton className="h-12 w-12 rounded-full"/>
}

export function SkeletonCard(){
return(
<div className="p-6 space-y-4 surface-card">
<Skeleton className="h-4 w-32"/>
<SkeletonText lines={3}/>
<Skeleton className="h-8 w-24"/>
</div>
)
}