// Vista simple: el admin ve la pantalla del operario (sin sidebar, inicio de
// dos botones). Es una PREFERENCIA DE PANTALLA, no un permiso — el admin sigue
// siendo admin y entra a cualquier ruta escribiéndola.
//
// Cookie y no localStorage, por el mismo motivo que SIDEBAR_COOKIE: el layout
// (server component) la lee y el primer render ya sale con la vista elegida,
// sin el salto de una a la otra.
export const SIMPLE_VIEW_COOKIE = "vista_simple"

export function setSimpleView(on: boolean) {
  document.cookie = `${SIMPLE_VIEW_COOKIE}=${on ? "1" : "0"}; path=/; max-age=31536000; samesite=lax`
}
