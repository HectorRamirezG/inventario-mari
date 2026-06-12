export const playSuccess = () => {
  const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2000/2000-preview.mp3')
  audio.volume = 0.4
  audio.play().catch(() => {})
}

export const playError = () => {
  const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2003/2003-preview.mp3')
  audio.volume = 0.4
  audio.play().catch(() => {})
}