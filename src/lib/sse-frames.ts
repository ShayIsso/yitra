/**
 * Splits accumulated SSE text on the `\n\n` frame separator, returning the
 * complete frames and whatever incomplete tail to keep buffering. Pure so it
 * can be pinned against adversarial splits (a separator itself split across
 * two `reader.read()` chunks) without a real fetch stream.
 */
export function takeFrames(buffer: string): { frames: string[]; rest: string } {
  const frames: string[] = [];
  let rest = buffer;
  let separatorIndex: number;
  while ((separatorIndex = rest.indexOf("\n\n")) !== -1) {
    frames.push(rest.slice(0, separatorIndex));
    rest = rest.slice(separatorIndex + 2);
  }
  return { frames, rest };
}
