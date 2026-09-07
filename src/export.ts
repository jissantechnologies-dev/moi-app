import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import { buildBackup, buildCsv, stamp } from './backupFormat';
import { Entry } from './types';

export { parseBackup } from './backupFormat';

/**
 * The browser has no share sheet and no file system to write to, so a download
 * is triggered instead: the text becomes a blob, and an anchor is clicked to
 * save it under the name we chose.
 */
function saveInBrowser(name: string, contents: string, mimeType: string): void {
  const blob = new Blob([contents], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();

  // Held briefly: revoking straight away can cancel a download that has not
  // finished starting.
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

async function writeAndShare(
  name: string,
  contents: string,
  mimeType: string,
  dialogTitle: string
): Promise<void> {
  if (Platform.OS === 'web') {
    saveInBrowser(name, contents, mimeType);
    return;
  }

  const dir = new Directory(Paths.cache, 'moi-exports');
  if (!dir.exists) dir.create({ intermediates: true });

  const file = new File(dir, name);
  file.create({ overwrite: true });
  file.write(contents);

  // Without a share sheet the file is written somewhere the person cannot
  // reach, so this is a failure and needs to say so rather than look done.
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Sharing is not available on this device.');
  }
  await Sharing.shareAsync(file.uri, {
    mimeType,
    dialogTitle,
    UTI: 'public.data',
  });
}

/**
 * Reads a file the person picked. The picker hands back a blob: URL in the
 * browser and a file:// path on a device, and those need different readers.
 */
export async function readPickedFile(uri: string): Promise<string> {
  if (Platform.OS === 'web') {
    const res = await fetch(uri);
    return await res.text();
  }
  return new File(uri).text();
}

export async function exportCsv(entries: Entry[]): Promise<void> {
  await writeAndShare(
    `moi-book-${stamp()}.csv`,
    buildCsv(entries),
    'text/csv',
    'Moi Book — CSV'
  );
}

export async function exportBackup(entries: Entry[]): Promise<void> {
  await writeAndShare(
    `moi-book-backup-${stamp()}.json`,
    buildBackup(entries),
    'application/json',
    'Moi Book — backup'
  );
}
