import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

/** What a picker hands back, ready to upload. */
export type PickedFile = { blob: Blob; mime: string; name: string };

export type PickResult =
  | { status: 'picked'; file: PickedFile }
  | { status: 'cancelled' }
  | { status: 'denied' }
  | { status: 'too-large' }
  | { status: 'unsupported' }
  | { status: 'error' };

/** Matches the server's cap, so an oversized file is refused before upload. */
const MAX_BYTES = 3 * 1024 * 1024;

/** Photos are re-encoded to at most this on the long edge before upload. */
const MAX_EDGE = 1600;

const IMAGE_TYPES = 'image/jpeg,image/png,image/webp,image/heic,image/heif';

function nameFrom(uri: string, fallback: string): string {
  const last = uri.split('/').pop() ?? '';
  const clean = last.split('?')[0];
  return clean && clean.includes('.') ? clean.slice(0, 200) : fallback;
}

/**
 * A phone camera produces several megabytes; the server takes three. Drawing
 * through a canvas both scales the image down and re-encodes it as JPEG, which
 * is what makes a bill photo small enough to sync.
 *
 * Canvas is a browser API, so this only runs on web. Native gets the same
 * effect from the picker's own `quality` setting.
 */
async function shrinkOnWeb(blob: Blob): Promise<Blob> {
  if (Platform.OS !== 'web' || !blob.type.startsWith('image/')) return blob;
  try {
    const bitmap = await createImageBitmap(blob);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    // Already small and already light: re-encoding would only lose quality.
    if (scale === 1 && blob.size <= MAX_BYTES / 2) return blob;

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return blob;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();

    const out = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.72)
    );
    return out && out.size < blob.size ? out : blob;
  } catch {
    // Any failure here is not worth losing the attachment over.
    return blob;
  }
}

async function finish(blob: Blob, mime: string, name: string): Promise<PickResult> {
  const shrunk = await shrinkOnWeb(blob);
  if (shrunk.size > MAX_BYTES) return { status: 'too-large' };
  return {
    status: 'picked',
    file: { blob: shrunk, mime: shrunk.type || mime, name },
  };
}

/** Reads a file:// or content:// URI into bytes. */
async function blobFromUri(uri: string): Promise<Blob> {
  const res = await fetch(uri);
  return await res.blob();
}

/**
 * The browser has no native picker to call, so one is made and clicked. The
 * `capture` attribute is what turns the same control into a camera on a phone
 * browser; desktop browsers ignore it and show the file chooser.
 */
function pickOnWeb(accept: string, capture: boolean): Promise<PickResult> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    if (capture) input.setAttribute('capture', 'environment');
    input.style.display = 'none';

    // There is no cancel event with useful support, so the element is simply
    // left for the page to drop along with the handler.
    input.onchange = () => {
      const file = input.files?.[0];
      input.remove();
      if (!file) return resolve({ status: 'cancelled' });
      void finish(file, file.type, file.name).then(resolve);
    };

    document.body.appendChild(input);
    input.click();
  });
}

async function fromPicker(
  launch: () => Promise<ImagePicker.ImagePickerResult>,
  fallbackName: string
): Promise<PickResult> {
  try {
    const result = await launch();
    if (result.canceled || !result.assets?.length) return { status: 'cancelled' };
    const asset = result.assets[0];
    const blob = await blobFromUri(asset.uri);
    const mime = asset.mimeType ?? 'image/jpeg';
    return await finish(blob, mime, asset.fileName ?? nameFrom(asset.uri, fallbackName));
  } catch {
    return { status: 'error' };
  }
}

/** Gallery on a phone, file chooser in a browser. */
export async function pickImage(): Promise<PickResult> {
  if (Platform.OS === 'web') return pickOnWeb(IMAGE_TYPES, false);

  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return { status: 'denied' };

  return fromPicker(
    () =>
      ImagePicker.launchImageLibraryAsync({
        mediaTypes: 'images',
        // Compression happens here on native, in place of the web canvas pass.
        quality: 0.7,
      }),
    'photo.jpg'
  );
}

/** Opens the camera. On a phone browser this is the same control with capture. */
export async function takePhoto(): Promise<PickResult> {
  if (Platform.OS === 'web') return pickOnWeb(IMAGE_TYPES, true);

  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) return { status: 'denied' };

  return fromPicker(
    () => ImagePicker.launchCameraAsync({ quality: 0.7 }),
    'photo.jpg'
  );
}

/** For bills that arrive as a PDF rather than a photo. */
export async function pickDocument(): Promise<PickResult> {
  if (Platform.OS === 'web') return pickOnWeb(`application/pdf,${IMAGE_TYPES}`, false);

  try {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'image/*'],
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets?.length) return { status: 'cancelled' };
    const asset = result.assets[0];
    const blob = await blobFromUri(asset.uri);
    return await finish(
      blob,
      asset.mimeType ?? 'application/pdf',
      asset.name ?? nameFrom(asset.uri, 'bill.pdf')
    );
  } catch {
    return { status: 'error' };
  }
}
