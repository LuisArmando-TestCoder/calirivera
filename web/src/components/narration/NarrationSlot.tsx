/**
 * Hueco para la rama 7 (voz de Cali, ElevenLabs). Cada beat del guión
 * («Guión de voz · Cali Rivera») tiene un slot en la sección donde suena.
 * Hoy no renderiza nada visible: solo marca el punto de anclaje.
 */
export function NarrationSlot({ beat }: { beat: string }) {
  return <span data-narration-beat={beat} hidden />;
}
