import { supabase } from "../../lib/supabase"

export interface ProductQuestion {
  id: string
  product_id: string
  customer_email: string
  customer_name: string | null
  question: string
  answer: string | null
  answered_at: string | null
  answered_by: string | null
  is_published: boolean
  created_at: string
}

export async function listProductQuestions(productId: string): Promise<ProductQuestion[]> {
  const { data, error } = await supabase
    .from("product_questions")
    .select("*")
    .eq("product_id", productId)
    .eq("is_published", true)
    .order("created_at", { ascending: false })
  if (error) return []
  return (data ?? []) as ProductQuestion[]
}

export async function listAllQuestions(opts?: {
  status?: "all" | "pending" | "answered"
  limit?: number
}): Promise<ProductQuestion[]> {
  let q = supabase
    .from("product_questions")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(opts?.limit ?? 100)
  if (opts?.status === "pending") q = q.is("answer", null)
  if (opts?.status === "answered") q = q.not("answer", "is", null)
  const { data, error } = await q
  if (error) return []
  return (data ?? []) as ProductQuestion[]
}

export async function createQuestion(input: {
  product_id: string
  customer_email: string
  customer_name?: string | null
  question: string
}): Promise<ProductQuestion> {
  const { data, error } = await supabase
    .from("product_questions")
    .insert({
      product_id: input.product_id,
      customer_email: input.customer_email.trim().toLowerCase(),
      customer_name: input.customer_name?.trim() || null,
      question: input.question.trim(),
    })
    .select()
    .single()
  if (error) throw error
  return data as ProductQuestion
}

export async function answerQuestion(id: string, answer: string, by?: string): Promise<void> {
  const { error } = await supabase
    .from("product_questions")
    .update({
      answer: answer.trim(),
      answered_at: new Date().toISOString(),
      answered_by: by ?? null,
    })
    .eq("id", id)
  if (error) throw error
}

export async function togglePublishQuestion(id: string, published: boolean): Promise<void> {
  const { error } = await supabase
    .from("product_questions")
    .update({ is_published: published })
    .eq("id", id)
  if (error) throw error
}

export async function deleteQuestion(id: string): Promise<void> {
  const { error } = await supabase.from("product_questions").delete().eq("id", id)
  if (error) throw error
}
