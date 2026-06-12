import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import LoginPage from '../auth/LoginPage'

const AuthContext = createContext<{ user: any }>({ user: null })

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Solo checamos si hay sesión real (para producción)
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  if (loading) return null // O tu spinner de carga

  // BYPASS TOTAL EN LOCALHOST:
  // Si estás en local, te trata como el admin sin preguntar.
  if (import.meta.env.DEV) {
    return (
      <AuthContext.Provider value={{ user: { email: 'admin@mari.com', id: '7878bc4c-1961-4628-bfe4-50580ee370a7' } }}>
        {children}
      </AuthContext.Provider>
    )
  }

  return (
    <AuthContext.Provider value={{ user }}>
      {user ? children : <LoginPage />}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)