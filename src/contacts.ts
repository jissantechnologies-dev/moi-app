import { Contact, requestPermissionsAsync } from 'expo-contacts';
import { normalizeNumber } from './format';
import { Platform } from 'react-native';

export type PickedContact = {
  firstName: string;
  lastName: string;
  phone: string;
};

export type PickResult =
  | { status: 'picked'; contact: PickedContact }
  | { status: 'cancelled' }
  | { status: 'denied' }
  | { status: 'no-number' }
  | { status: 'unsupported' }
  | { status: 'error' };

export const contactsSupported = Platform.OS !== 'web';

/**
 * Opens the system contact picker. The OS shows the list, so the app never
 * reads the whole address book — only the one contact the user taps comes back.
 */
export async function pickContact(): Promise<PickResult> {
  if (!contactsSupported) return { status: 'unsupported' };

  try {
    const permission = await requestPermissionsAsync();
    if (!permission.granted) return { status: 'denied' };

    const contact = await Contact.presentPicker();
    if (!contact) return { status: 'cancelled' };

    const [firstName, lastName, phones] = await Promise.all([
      contact.getGivenName(),
      contact.getFamilyName(),
      contact.getPhones(),
    ]);

    const phone = phones.find((p) => p.number)?.number ?? '';
    if (!phone) return { status: 'no-number' };

    return {
      status: 'picked',
      contact: {
        firstName: firstName ?? '',
        lastName: lastName ?? '',
        phone: normalizeNumber(phone),
      },
    };
  } catch {
    return { status: 'error' };
  }
}

