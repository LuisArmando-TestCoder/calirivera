/** ¿Esta página se está viendo dentro de otra (la vista viva del menú)? Ahí no suena ni se edita nada. */
export const embedded = () => typeof window !== "undefined" && window.top !== window;
