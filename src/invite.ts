import { Linking, Platform } from 'react-native';
import { whatsappNumber } from './format';
import { t } from './i18n';
import { Lang } from './types';

/**
 * Where the app lives, for the link inside the invite. On the web the page
 * already knows; a native build has no origin to read, so it falls back to the
 * deployed address.
 */
export const APP_URL =
  Platform.OS === 'web' && typeof window !== 'undefined' && window.location?.origin
    ? window.location.origin
    : 'https://moi.gvndemo.com';

/**
 * Opens WhatsApp with the invite already typed, addressed to this number.
 *
 * The message is *not* sent by us. It opens in the person's own WhatsApp for
 * them to send, which is why this needs no Business API, no message template
 * and no opt-in from the recipient: it is one person messaging another. An
 * app that sent these itself would be messaging people who never asked to hear
 * from it, and Meta restricts numbers that do.
 *
 * Returns false when the number cannot be dialled or WhatsApp will not open,
 * so the caller can say so rather than leave a dead button.
 */
export async function inviteOnWhatsApp(phone: string, lang: Lang): Promise<boolean> {
  const number = whatsappNumber(phone);
  if (!number) return false;

  const text = t(lang).inviteMessage(APP_URL);
  const url = `https://wa.me/${number}?text=${encodeURIComponent(text)}`;

  try {
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}

/** Whether the invite button has a number worth offering. */
export function canInvite(phone: string): boolean {
  return whatsappNumber(phone) !== null;
}
