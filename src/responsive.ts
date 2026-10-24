/** Keep navigation compact on small screens and reopen it when returning to desktop. */
export function compactPanel(panel: HTMLDetailsElement, breakpoint: number) {
  const media = matchMedia(`(max-width: ${breakpoint}px)`);
  const update = () => { panel.open = !media.matches; };
  update(); media.addEventListener('change', update);
  return () => media.removeEventListener('change', update);
}
