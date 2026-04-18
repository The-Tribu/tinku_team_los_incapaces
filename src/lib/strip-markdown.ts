/**
 * MiniMax a veces insiste en usar markdown aunque le pidas texto plano.
 * Este sanitizador deja prosa corrida: quita encabezados `###`, viñetas `-`,
 * numeración, énfasis `**`/`*`/`__`, bloques de código y citas `>`.
 * Se usa tanto en el server (al persistir la narrativa) como en el cliente
 * (para renderizar el texto que ya vino del endpoint). Sin dependencias.
 */
export function stripMarkdown(input: string): string {
  return input
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s{0,3}>\s?/gm, "")
    .replace(/^\s{0,3}[-*+]\s+/gm, "")
    .replace(/^\s{0,3}\d+[.)]\s+/gm, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/(?<!\*)\*(?!\s)(.+?)(?<!\s)\*(?!\*)/g, "$1")
    .replace(/(?<!_)_(?!\s)(.+?)(?<!\s)_(?!_)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^\s*\|[^\n]*\|\s*$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
