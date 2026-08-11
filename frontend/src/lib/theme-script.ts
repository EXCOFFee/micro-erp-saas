/**
 * Tema claro/oscuro — clave compartida de localStorage y script de
 * inicialización sin flash (FOUC).
 *
 * El script se inyecta inline en <head> y corre ANTES de la hidratación de
 * React: lee la preferencia guardada o, si no hay ninguna, respeta
 * `prefers-color-scheme` del sistema, y aplica `data-theme` en <html> de
 * inmediato — así el usuario nunca ve un flash del tema por defecto (claro)
 * antes de que se aplique su preferencia real (oscuro).
 */
export const THEME_STORAGE_KEY = "micro-erp-theme";

export const THEME_INIT_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem("${THEME_STORAGE_KEY}");
    var theme = stored === "dark" || stored === "light"
      ? stored
      : (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    document.documentElement.setAttribute("data-theme", theme);
  } catch (e) {
    document.documentElement.setAttribute("data-theme", "light");
  }
})();
`;
