import { supabase } from "./supabase"
import type { SupabaseClient, PostgrestError } from "@supabase/supabase-js"

/**
 * Repositorio base con CRUD genérico sobre Supabase.
 * Extiende esta clase para cada tabla y mantén el código DRY.
 *
 *   class ProductRepo extends BaseRepository<Product> {
 *     constructor() { super("products") }
 *   }
 */
export abstract class BaseRepository<T extends { id?: string }> {
  protected readonly client: SupabaseClient
  protected readonly table: string

  constructor(table: string, client: SupabaseClient = supabase) {
    this.table = table
    this.client = client
  }

  protected handle<R>(data: R | null, error: PostgrestError | null, ctx: string): R {
    if (error) {
      // eslint-disable-next-line no-console
      console.error(`[${this.table}] ${ctx}:`, error.message)
      throw new Error(error.message)
    }
    return data as R
  }

  async list(select = "*"): Promise<T[]> {
    const { data, error } = await this.client.from(this.table).select(select)
    return this.handle(data as unknown as T[], error, "list") ?? []
  }

  async get(id: string, select = "*"): Promise<T | null> {
    const { data, error } = await this.client
      .from(this.table)
      .select(select)
      .eq("id", id)
      .maybeSingle()
    return this.handle(data as unknown as T | null, error, "get")
  }

  async create(payload: Partial<T>): Promise<T> {
    const { data, error } = await this.client
      .from(this.table)
      .insert(payload as any)
      .select()
      .single()
    return this.handle(data as unknown as T, error, "create")
  }

  async update(id: string, patch: Partial<T>): Promise<T> {
    const { data, error } = await this.client
      .from(this.table)
      .update(patch as any)
      .eq("id", id)
      .select()
      .single()
    return this.handle(data as unknown as T, error, "update")
  }

  async remove(id: string): Promise<void> {
    const { error } = await this.client.from(this.table).delete().eq("id", id)
    this.handle(null, error, "remove")
  }

  /** Borrado lógico estándar (is_active=false) */
  async softDelete(id: string): Promise<void> {
    const { error } = await this.client
      .from(this.table)
      .update({ is_active: false } as any)
      .eq("id", id)
    this.handle(null, error, "softDelete")
  }
}
