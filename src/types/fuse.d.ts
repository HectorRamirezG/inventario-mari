// Shim ambient para `fuse.js` cuando el dev local no tiene `node_modules`
// instalados. La libreria fuse.js v7+ trae sus propios types embebidos en
// `node_modules/fuse.js/dist/fuse.d.ts`, asi que en CI/Vercel (donde si
// se hace `npm install`) este shim queda ENMASCARADO por los types reales.
//
// En local, cuando Mari abre cualquier archivo que hace
// `import Fuse from "fuse.js"`, el TS Server marcaba el error
// "Cannot find module 'fuse.js' or its corresponding type declarations."
// con este shim el modulo aparece pero como `any` — pierde autocomplete
// pero deja compilar / lintar sin warnings rojos.
//
// Si Mari decide instalar deps localmente, este archivo deja de tener
// efecto (los types reales ganan precedencia).
declare module "fuse.js"
