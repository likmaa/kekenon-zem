const MONTHS_FR = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const DAYS_FR = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
const pad = (n: number) => String(n).padStart(2, '0');

export function fmtDateMedium(d: Date): string {
  return `${pad(d.getDate())} ${MONTHS_FR[d.getMonth()]} ${d.getFullYear()}`;
}
export function fmtDateShort(d: Date): string {
  return `${pad(d.getDate())} ${MONTHS_FR[d.getMonth()]}`;
}
export function fmtDayDateShort(d: Date): string {
  return `${DAYS_FR[d.getDay()]} ${pad(d.getDate())} ${MONTHS_FR[d.getMonth()]}`;
}
export function fmtTime(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export function fmtDayDateTime(d: Date): string {
  return `${DAYS_FR[d.getDay()]} ${pad(d.getDate())} ${MONTHS_FR[d.getMonth()]} ${d.getFullYear()}, ${pad(d.getHours())}h${pad(d.getMinutes())}`;
}
