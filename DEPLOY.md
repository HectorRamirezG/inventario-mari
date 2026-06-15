# Mari Inventario v2 · Guía de despliegue

> **Refactor mayor**: PIN local reemplazado por Supabase Auth, ticket
> público en `/ticket/:token`, modo cliente self-shopping, fotos de
> productos, Action Hub central. Este documento explica QUÉ correr para
> que todo lo nuevo funcione en producción.

---

## 1. Variables de entorno (Vercel + `.env.local`)

```bash
VITE_SUPABASE_URL=https://naxdlainnnkyctcisnew.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_UviL4QyL2c1Fiy5Dje5UkQ_se2lCZWB
```

> El cliente tiene self-healing: si una env var apunta a una URL vieja
> (`ppvfxgjcrxrtlxdvtijg.supabase.co`) o viene como markdown `[url](url)`,
> se ignora y se usa el default seguro.

**No agregues** `SUPABASE_SERVICE_ROLE_KEY` ni `MP_ACCESS_TOKEN` al
proyecto del frontend — esos vivirán en funciones serverless cuando
implementes Mercado Pago.

---

## 2. Migración SQL — correr **UNA sola vez**

Abre **Supabase → SQL Editor → New query** y pega el contenido de:

```
supabase/migrations/0007_auth_roles_images_public_ticket.sql
```

Esto crea / configura:

| Recurso | Para qué sirve |
|--------|----------------|
| `public.user_profiles` | Mapa `auth.users → role (admin/staff/client)` |
| Trigger `on_auth_user_created` | Asigna `admin` automático a `mariamcontreras07@gmail.com` y `zemog050301@gmail.com`; resto entra como `client` |
| `products.image_url`, `variants.image_url` | URL pública de la foto del producto |
| Storage bucket `product-images` (público) | Para subir fotos desde Admin |
| `sales.customer_email`, `sales.public_token` | Para self-shopping (RLS) y ticket público |
| Vistas `products_public`, `variants_public` | Catálogo SIN columnas de costo (las consume el cliente) |
| RPC `get_public_ticket(p_token)` | Devuelve un ticket sin login (lo usa `/ticket/:token`) |
| Políticas RLS en `sales`, `sale_items`, `payments`, `movements`, `products`, `variants` | Admin/staff = todo · cliente = sólo lo suyo · anon = sólo vistas públicas y RPC del ticket |

El script es **idempotente** (puedes correrlo varias veces sin romper nada).

---

## 3. Crear los usuarios admin

1. Ve a **Supabase → Authentication → Providers** y deja sólo activos:
   - ✅ Email (con magic link y/o password)
   - ❌ Anything else (a menos que quieras Google/Apple/etc.)
2. Entra a la app desplegada y registra:
   - `mariamcontreras07@gmail.com` → se asigna **admin** automático
   - `zemog050301@gmail.com` → se asigna **admin** automático
3. Cualquier otro correo se registra como **client** por defecto.

### Promover una cajera a `staff`

Como no hay UI todavía para promover (TODO listado abajo), ejecuta en SQL Editor:

```sql
update public.user_profiles
   set role = 'staff'
 where email = 'correo-de-la-cajera@gmail.com';
```

---

## 4. Storage — verificar bucket de fotos

Aunque la migración crea el bucket `product-images`, confirma en
**Supabase → Storage**:

- ✅ Bucket existe y está marcado como **public**
- ✅ Policies aplicadas (lectura pública / escritura staff+admin)

Tamaño máximo recomendado: 5MB por imagen (el uploader del frontend
ya lo valida).

---

## 5. Rutas / Mapa de navegación

| Ruta | Acceso | Para qué |
|------|--------|----------|
| `/login` | Público | Login email/password o magic link |
| `/ticket/:token` | **PÚBLICO sin login** | Ticket digital, comparte por WhatsApp |
| `/` y sub-rutas | Sesión requerida | App principal (bifurca por rol) |
| `/mis-pedidos` | rol = `client` | Lista de apartados/compras del cliente logueado |

### Bifurcación por rol
- **admin / staff** → Shell completo: dashboard, inventario, ventas, apartados, precios (solo admin), settings + **Action Hub central**.
- **client** → Shell catálogo: bento-grid de productos, carrito propio, apartado con un toque, mis pedidos.

---

## 6. Cambios del producto (no solo técnico)

### 🎫 Tickets WhatsApp ultra-profesionales
El mensaje se genera en [`src/lib/receipt.ts`](src/lib/receipt.ts):
- Encabezado con marca y emojis
- Cada item con cantidad, tier (Menudeo/Medio/Mayoreo) y subtotal
- Totales destacados con `*negritas*` de WhatsApp
- **Enlace público al ticket digital** (apunta a `/ticket/:token`)
- Si la venta tiene `payment_url`, se incluye como liga directa de pago

### 🛒 Action Hub (botón central del dock)
Reemplaza el FAB simple. Al tocar el botón rosa-lila del centro del dock
se abre un drawer con:
- ⚡ Venta rápida
- 📷 Escanear código de barras
- ➕ Nuevo producto
- 📌 Registrar apartado

Soporta drag-down para cerrar (iOS-like).

### 📸 Fotos de productos
- Botón "Agregar foto" / "Cámara" en `EditProductModal` ([uploader](src/components/ui/ProductImageUploader.tsx))
- Visible en `ProductCard` (tarjeta de inventario) y en `ClientShop` (bento-grid del cliente)

### 👤 Modo cliente
- Catálogo bento-grid con buscador
- Carrito persistente en memoria
- "Apartar y generar ticket" → crea `sales` con `customer_email = auth.email()` y `status = pending`, redirige al ticket público

### 🔐 Auth real
- Email/password + magic link
- Sesión persistente (Supabase storage)
- Cierre de sesión visible en header y en Settings
- PIN local **REMOVIDO** (los archivos `useRole.ts` y `PinGate.tsx` quedan en el repo como dead code; pueden borrarse en un commit posterior si quieres)

---

## 7. Despliegue (Vercel)

Build sin cambios:

```
npm install
npm run build
```

Vercel detecta Vite automáticamente. El SW se autopurga al primer load
gracias al one-shot cleanup en [`src/main.tsx`](src/main.tsx).

**Bundle final**: ~447 KB gzip (1.5MB sin comprimir). Si pesa más,
considera `manualChunks` en `vite.config.ts` para separar `recharts`,
`html5-qrcode` y `@react-pdf/renderer`.

---

## 8. Cosas pendientes / TODO recomendado

- [ ] **Mercado Pago**: agregar función serverless `/api/mp-link` (recibe `sale_id` y monto, devuelve `init_point`). Guardar el URL en `sales.payment_url`. Webhook en `/api/mp-webhook` para marcar la venta como pagada.
- [ ] **UI de gestión de roles** dentro de Settings (admin puede ver lista de `user_profiles` y promover client → staff).
- [ ] **Producto creado por cliente con stock < pedido**: validar al crear apartado, hoy descuenta cuando el admin confirma.
- [ ] **Notificaciones push**: cuando un cliente apartado realiza un pedido, el admin recibe un toast/notificación.
- [ ] **Tests**: `vitest` ya está instalado pero sin specs. Empezar por `salesTier.test.ts` (caso menudeo→medio→mayoreo).
- [ ] **Code-splitting**: dynamic import de `PricingPage`, `MovementHistoryPage` y `BarcodeScanner`.

---

## 9. Rollback de emergencia

Si algo se rompe en producción y necesitas regresar al PIN local:

```bash
git revert HEAD --no-edit
git push origin main
```

(El refactor está en un solo commit grande para que el rollback sea atómico.)
