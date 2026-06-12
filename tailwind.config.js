/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Paleta Boutique Mari
        primary: {
          DEFAULT: "#e6007e", // El rosa vibrante de la captura
          hover: "#c4006b",
          subtle: "#fff0f7",
          glass: "rgba(230, 0, 126, 0.05)",
        },
        slate: {
          950: "#020617", // Para el botón de alto contraste
          900: "#0f172a",
          text: "#1e293b",
          muted: "#64748b",
        },
        // Estados con estilo pastel
        success: {
          DEFAULT: "#10b981",
          bg: "#f0fdf4",
        },
        danger: {
          DEFAULT: "#ef4444",
          bg: "#fef2f2",
        },
        appbg: "#ffffff", // Fondo base limpio
      },

      borderRadius: {
        'brand': '3rem',     // El redondeado exagerado de las cards (iPhone style)
        'xlsoft': '2.25rem', // Para modales
        'soft': '1.5rem',    // Para botones e inputs
        'pill': '9999px',
      },

      boxShadow: {
        // Sombras de varias capas para efecto de profundidad real
        'premium': '0 20px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.05)',
        'bloom': '0 15px 35px -5px rgba(230, 0, 126, 0.18)', // Resplandor rosa
        'inner-soft': 'inset 0 2px 6px 0 rgba(0, 0, 0, 0.04)',
        'glass': '0 8px 32px 0 rgba(31, 38, 135, 0.07)',
      },

      transitionTimingFunction: {
        'expo': 'cubic-bezier(0.87, 0, 0.13, 1)',
        'back': 'cubic-bezier(0.34, 1.56, 0.64, 1)', // Efecto rebote Apple
      },

      animation: {
        'card-entrance': 'cardEntrance 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) backwards',
        'pulse-soft': 'pulseSoft 2s infinite',
      },

      keyframes: {
        cardEntrance: {
          '0%': { opacity: '0', transform: 'translateY(30px) scale(0.95)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        pulseSoft: {
          '0%, 100%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(1.02)' },
        }
      },
    },
  },
  plugins: [],
}