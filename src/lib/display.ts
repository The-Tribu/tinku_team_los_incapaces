/**
 * Helpers de presentación consistente en la UI.
 */

/**
 * Nombres de "clientes paraguas" (operador) que se auto-generan cuando se
 * sincroniza la flota real desde el middleware. En esas vistas el usuario
 * realmente quiere ver el nombre de la planta, no el operador.
 */
const UMBRELLA_CLIENT_NAMES = new Set<string>([
  "Techos Rentables (real)",
]);

export function isUmbrellaClient(clientName: string | null | undefined): boolean {
  if (!clientName) return false;
  return UMBRELLA_CLIENT_NAMES.has(clientName.trim());
}

/**
 * Devuelve el nombre "cliente" correcto para mostrar en tablas / cards.
 * Si el client es el paraguas del operador, preferimos el nombre de la planta
 * (que codifica al cliente final en los datos sincronizados).
 */
export function displayClientLabel(
  client: { name: string | null | undefined } | null | undefined,
  plant?: { name: string | null | undefined } | null,
): string {
  const clientName = client?.name?.trim() ?? "";
  if (isUmbrellaClient(clientName) && plant?.name) return plant.name;
  return clientName || plant?.name || "—";
}
