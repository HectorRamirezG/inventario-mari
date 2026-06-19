import { QueryClient } from "@tanstack/react-query"

// Configuración global del cache. Mantenemos staleTime corto (30s) para
// que las invalidaciones del hub realtime sean las que disparen refetch
// frescos sin pelearse con un refetchOnWindowFocus agresivo.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      retry: 1,
    },
    mutations: {
      retry: 0,
    },
  },
})
