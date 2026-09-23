/** The photo, water matte, foliage and route share this single cover crop. */
export function coverTransform(sourceWidth: number, sourceHeight: number, width: number, height: number) {
  const scale = Math.max(width / sourceWidth, height / sourceHeight);
  const resultWidth = sourceWidth * scale;
  const resultHeight = sourceHeight * scale;
  const round = (value: number) => Math.round(value * 100) / 100;
  return { width: round(resultWidth), height: round(resultHeight), x: round((width - resultWidth) / 2), y: round((height - resultHeight) / 2) };
}
