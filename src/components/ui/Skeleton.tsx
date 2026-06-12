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
"relative overflow-hidden bg-slate-100",
"animate-pulse",
r[rounded],
className
)}
>
<div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/60 to-transparent animate-[shimmer_1.8s_infinite]" />
</div>
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
<div className="p-6 space-y-4 bg-white border border-pink-100 rounded-[2rem] shadow-[0_6px_25px_rgba(0,0,0,0.04)]">
<Skeleton className="h-4 w-32"/>
<SkeletonText lines={3}/>
<Skeleton className="h-8 w-24"/>
</div>
)
}