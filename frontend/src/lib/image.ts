/**
 * Reduce una foto a JPEG antes de subirla, para gastar pocos datos.
 *
 * Args:
 *   file: Imagen elegida o tomada con la cámara.
 *   size: Lado máximo en píxeles.
 *   square: Si es true, recorta al centro en cuadrado (foto de perfil).
 */
export async function shrinkImage(file: File, size: number, square = false): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const sourceW = square ? side : bitmap.width;
  const sourceH = square ? side : bitmap.height;
  const scale = Math.min(1, size / Math.max(sourceW, sourceH));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(sourceW * scale);
  canvas.height = Math.round(sourceH * scale);
  canvas
    .getContext("2d")
    ?.drawImage(bitmap, (bitmap.width - sourceW) / 2, (bitmap.height - sourceH) / 2, sourceW, sourceH, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("No se pudo leer la foto"))), "image/jpeg", 0.82),
  );
}
