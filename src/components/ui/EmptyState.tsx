import Button from "./Button"

export default function EmptyState(props: any){

  const {
    title = "Sin información",
    description,
    icon,
    actionLabel,
    onAction
  } = props

  return(

    <div className="rounded-[2rem] bg-white border border-pink-100/70 shadow-[0_4px_20px_-10px_rgba(0,0,0,0.04)] px-10 py-12 text-center">

      <div className="mx-auto mb-6 flex items-center justify-center w-16 h-16 rounded-2xl bg-pink-50 text-pink-500">
        {icon ?? <span className="text-xl">🌸</span>}
      </div>

      <h3 className="text-[17px] font-semibold text-slate-800">
        {title}
      </h3>

      {description && (
        <p className="text-sm text-slate-500 mt-2 max-w-xs mx-auto leading-relaxed">
          {description}
        </p>
      )}

      {actionLabel && onAction && (
        <div className="mt-6 flex justify-center">
          <Button variant="soft" onClick={onAction}>
            {actionLabel}
          </Button>
        </div>
      )}

    </div>

  )

}