import { Capacitor } from '@capacitor/core';
import { download } from './format';

/*
 * The Android WebView can't download files or use navigator.share with files: inside the app
 * everything goes through the native plugins (Filesystem + Share). On the web the browser
 * is used.
 */
export const isNative = Capacitor.isNativePlatform();

function blobToBase64(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export type ShareResult = 'shared' | 'downloaded' | 'cancelled';

/**
 * Hands a file to the user. On Android it's saved to the app's cache and the system menu
 * opens: from there it goes to Gallery, Drive, Files, WhatsApp, TikTok… On the web it uses the
 * share menu if there is one, or else downloads it.
 */
export async function shareFile(blob: Blob, fileName: string, title: string): Promise<ShareResult> {
  if (isNative) {
    const [{ Filesystem, Directory }, { Share }] = await Promise.all([import('@capacitor/filesystem'), import('@capacitor/share')]);
    const { uri } = await Filesystem.writeFile({ path: fileName, data: await blobToBase64(blob), directory: Directory.Cache });
    try {
      await Share.share({ title, dialogTitle: title, files: [uri] });
      return 'shared';
    } catch (e) {
      if (/cancel/i.test(String((e as Error)?.message ?? e))) return 'cancelled';
      throw e;
    }
  }
  const file = new File([blob], fileName, { type: blob.type });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title });
      return 'shared';
    } catch (e) {
      if ((e as DOMException).name === 'AbortError') return 'cancelled';
    }
  }
  download(blob, fileName);
  return 'downloaded';
}

/** Shares text (progress, a quote). Returns false if it only got copied. */
export async function shareText(text: string, title: string) {
  if (isNative) {
    const { Share } = await import('@capacitor/share');
    try {
      await Share.share({ title, text, dialogTitle: title });
    } catch {
      // Cancelled by the user.
    }
    return true;
  }
  if (navigator.share) {
    await navigator.share({ text, title }).catch(() => undefined);
    return true;
  }
  await navigator.clipboard.writeText(text);
  return false;
}

/** A small vibration on meaningful actions (highlight, bookmark). Only on the phone. */
export async function haptic(kind: 'light' | 'medium' | 'success' = 'light') {
  if (!isNative) return;
  try {
    const { Haptics, ImpactStyle, NotificationType } = await import('@capacitor/haptics');
    if (kind === 'success') await Haptics.notification({ type: NotificationType.Success });
    else await Haptics.impact({ style: kind === 'medium' ? ImpactStyle.Medium : ImpactStyle.Light });
  } catch {
    // Without a vibration motor nothing happens.
  }
}

/**
 * Status bar while reading: it hides along with the controls (immersive reading) and its
 * icons switch to light or dark based on the book's theme.
 */
export async function statusBar(opts: { visible: boolean; darkBackground: boolean }) {
  if (!isNative) return;
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    await StatusBar.setStyle({ style: opts.darkBackground ? Style.Dark : Style.Light });
    if (opts.visible) await StatusBar.show();
    else await StatusBar.hide();
  } catch {
    // Not available on this device.
  }
}
