import { useEffect, useState } from "react"
import { supabase } from "../../lib/supabase"

export interface BankAccount {
  bank: string
  holder: string
  clabe: string
  card: string
  notes: string
}

export const DEFAULT_BANK: BankAccount = {
  bank: "",
  holder: "",
  clabe: "",
  card: "",
  notes: "",
}

let cache: BankAccount | null = null
const listeners = new Set<(b: BankAccount) => void>()

async function load(): Promise<BankAccount> {
  if (cache) return cache
  try {
    const { data } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "bank_account")
      .maybeSingle()
    const v = (data?.value as any) ?? {}
    cache = { ...DEFAULT_BANK, ...v }
  } catch {
    cache = { ...DEFAULT_BANK }
  }
  listeners.forEach((l) => l(cache!))
  return cache!
}

export async function saveBankAccount(b: BankAccount): Promise<void> {
  const { error } = await supabase
    .from("app_settings")
    .upsert(
      { key: "bank_account", value: b, updated_at: new Date().toISOString() },
      { onConflict: "key" }
    )
  if (error) throw error
  cache = { ...b }
  listeners.forEach((l) => l(cache!))
}

export function useBankAccount(): BankAccount {
  const [val, setVal] = useState<BankAccount>(cache ?? DEFAULT_BANK)
  useEffect(() => {
    let alive = true
    if (!cache) load().then((b) => alive && setVal(b))
    else setVal(cache)
    const l = (b: BankAccount) => alive && setVal(b)
    listeners.add(l)
    return () => {
      alive = false
      listeners.delete(l)
    }
  }, [])
  return val
}

export function hasBankAccount(b: BankAccount): boolean {
  return !!(b.clabe || b.card || b.bank)
}
