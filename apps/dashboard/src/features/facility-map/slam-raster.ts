/** ROS map-server's unknown-cell gray, also retained by the edited display layer. */
const UNKNOWN_GRAY = 205;

/** Change display alpha only; retain opaque observation pixels exactly. */
export function clearUnknownPixels(pixels: Uint8ClampedArray) {
  for (let i = 0; i < pixels.length; i += 4) {
    const gray = pixels[i], alpha = pixels[i + 3];
    // Canvas rounds premultiplied channels to 8 bits. At the rotated layer's
    // translucent edge, original gray 205 can read back as 204/206 (or farther
    // away at very low alpha). Account only for that quantization, never use a
    // gray-range threshold on opaque observation pixels.
    const tolerance = alpha > 0 && alpha < 255 ? 0.5 + 127.5 / alpha : 0;
    if (pixels[i + 1] === gray && pixels[i + 2] === gray && Math.abs(gray - UNKNOWN_GRAY) <= tolerance) {
      pixels[i + 3] = 0;
    }
  }
}

export async function createSlamDisplayUrl(source: string): Promise<string> {
  const image = new Image();
  image.src = source;
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("SLAM display canvas unavailable");
  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  clearUnknownPixels(pixels.data);
  context.putImageData(pixels, 0, 0);
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(result => {
    if (result) resolve(result);
    else reject(new Error("SLAM display encoding failed"));
  }, "image/png"));
  return URL.createObjectURL(blob);
}
