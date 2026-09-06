import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { buildBackup, buildCsv, stamp } from './backupFormat';
import { Entry } from './types';

export { parseBackup } from './backupFormat';

async function writeAndShare(
  name: string,
  contents: string,
  mimeType: string,
  dialogTitle: string
): Promise<void> {
  const dir = new Directory(Paths.cache, 'moi-exports');
  if (!dir.exists) dir.create({ intermediates: true });

  const file = new File(dir, name);
  file.create({ overwrite: true });
  file.write(contents);

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, {
      mimeType,
      dialogTitle,
      UTI: 'public.data',
    });
  }
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
