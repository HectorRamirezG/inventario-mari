import { useCallback, useEffect, useState } from "react"
import {
  getActiveCycle,
  getCycleSnapshot,
  listCycles,
  listExpenses,
  listInjections,
  type CapitalInjection,
  type CycleSnapshot,
  type InventoryCycle,
  type OperatingExpense,
} from "./cyclesService"

interface CycleState {
  loading: boolean
  active: InventoryCycle | null
  snapshot: CycleSnapshot | null
  history: InventoryCycle[]
  injections: CapitalInjection[]
  expenses: OperatingExpense[]
}

/**
 * Carga + autorefresco del ciclo activo. La refresh se dispara
 * manualmente desde acciones (agregar gasto / inyección / cerrar).
 * NO usamos realtime aquí para no abrir un canal extra; el refresco
 * manual es suficiente para este flujo.
 */
export function useCycle() {
  const [state, setState] = useState<CycleState>({
    loading: true,
    active: null,
    snapshot: null,
    history: [],
    injections: [],
    expenses: [],
  })

  const refresh = useCallback(async () => {
    setState((s) => ({ ...s, loading: true }))
    try {
      const [active, history] = await Promise.all([
        getActiveCycle(),
        listCycles(),
      ])
      let snapshot: CycleSnapshot | null = null
      let injections: CapitalInjection[] = []
      let expenses: OperatingExpense[] = []
      if (active) {
        ;[snapshot, injections, expenses] = await Promise.all([
          getCycleSnapshot(active.id),
          listInjections(active.id),
          listExpenses(active.id),
        ])
      }
      setState({
        loading: false,
        active,
        snapshot,
        history,
        injections,
        expenses,
      })
    } catch (e) {
      console.error(e)
      setState((s) => ({ ...s, loading: false }))
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { state, refresh }
}
