import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { t } from '../i18n';
import { colors, radius, space } from '../theme';
import { Lang } from '../types';

export type MenuAction = 'csv' | 'backup' | 'restore' | 'signout';

export default function MenuSheet({
  visible,
  lang,
  busy,
  accountEmail,
  onSelect,
  onClose,
}: {
  visible: boolean;
  lang: Lang;
  busy: boolean;
  /** Email of the signed-in account, or null when using this device only. */
  accountEmail?: string | null;
  onSelect: (a: MenuAction) => void;
  onClose: () => void;
}) {
  const L = t(lang);
  const insets = useSafeAreaInsets();

  const items: { key: MenuAction; title: string; hint: string; danger?: boolean }[] =
    [
      { key: 'csv', title: L.exportCsv, hint: L.exportCsvHint },
      { key: 'backup', title: L.backup, hint: L.backupHint },
      { key: 'restore', title: L.restore, hint: L.restoreHint, danger: true },
    ];

  if (accountEmail) {
    items.push({ key: 'signout', title: L.signOut, hint: accountEmail });
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={busy ? undefined : onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + space(4) }]}>
        <View style={styles.grabber} />
        {items.map((item) => (
          <Pressable
            key={item.key}
            disabled={busy}
            onPress={() => onSelect(item.key)}
            style={({ pressed }) => [
              styles.item,
              (pressed || busy) && { opacity: 0.6 },
            ]}
          >
            <Text
              style={[styles.itemTitle, item.danger && { color: colors.primary }]}
            >
              {item.title}
            </Text>
            <Text style={styles.itemHint}>{item.hint}</Text>
          </Pressable>
        ))}
        <Pressable
          onPress={onClose}
          disabled={busy}
          style={({ pressed }) => [styles.cancel, pressed && { opacity: 0.6 }]}
        >
          <Text style={styles.cancelText}>{L.cancel}</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: space(4),
    paddingTop: space(3),
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: space(3),
  },
  item: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: space(4),
    marginBottom: space(2.5),
  },
  itemTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  itemHint: { fontSize: 13, color: colors.textSoft, marginTop: 3 },
  cancel: { alignItems: 'center', paddingVertical: space(3.5) },
  cancelText: { fontSize: 16, fontWeight: '600', color: colors.textSoft },
});
