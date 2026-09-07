import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as api from '../api';
import { pickDocument, pickImage, takePhoto, PickResult } from '../attachments';
import { t } from '../i18n';
import { colors, radius, space } from '../theme';
import { Attachment, Lang } from '../types';

type Props = {
  lang: Lang;
  value: Attachment[];
  onChange: (next: Attachment[]) => void;
  /** Uploads need an account: the files live with the signed-in user. */
  canAttach: boolean;
};

/**
 * The bill and gift photos on an entry.
 *
 * A thumbnail cannot simply point at the file: the route needs an
 * Authorization header, so each image is fetched once and held as a data URI
 * for as long as the form is open. PDFs get a document tile instead, since
 * there is nothing to draw.
 */
export default function Attachments({ lang, value, onChange, canAttach }: Props) {
  const L = t(lang);
  const [busy, setBusy] = useState(false);
  const [previews, setPreviews] = useState<Record<string, string>>({});

  useEffect(() => {
    let live = true;
    const wanted = value.filter(
      (a) => a.mime.startsWith('image/') && !previews[a.id]
    );
    if (!wanted.length) return;

    void (async () => {
      for (const a of wanted) {
        const uri = await api.attachmentDataUri(a.id).catch(() => null);
        // The form may have closed, or the attachment been removed, while the
        // bytes were in flight.
        if (!live || !uri) continue;
        setPreviews((prev) => ({ ...prev, [a.id]: uri }));
      }
    })();

    return () => {
      live = false;
    };
  }, [value, previews]);

  async function add(pick: () => Promise<PickResult>) {
    if (busy) return;
    const result = await pick();

    switch (result.status) {
      case 'cancelled':
        return;
      case 'denied':
        Alert.alert(L.attachDenied);
        return;
      case 'too-large':
        Alert.alert(L.attachTooLarge);
        return;
      case 'unsupported':
      case 'error':
        Alert.alert(L.attachFailed);
        return;
    }

    setBusy(true);
    try {
      const saved = await api.uploadAttachment(
        result.file.blob,
        result.file.mime,
        result.file.name
      );
      onChange([...value, saved]);
    } catch {
      Alert.alert(L.attachFailed);
    } finally {
      setBusy(false);
    }
  }

  function remove(a: Attachment) {
    Alert.alert(L.attachRemoveTitle, a.name || L.attachment, [
      { text: L.cancel, style: 'cancel' },
      {
        text: L.delete,
        style: 'destructive',
        onPress: () => {
          // Dropped from the entry first: if the server delete fails the file
          // is orphaned, which is tidier than a row pointing at nothing.
          onChange(value.filter((x) => x.id !== a.id));
          void api.deleteAttachment(a.id).catch(() => {});
        },
      },
    ]);
  }

  async function open(a: Attachment) {
    const uri = previews[a.id] ?? (await api.attachmentDataUri(a.id).catch(() => null));
    if (!uri) {
      Alert.alert(L.attachFailed);
      return;
    }
    await Linking.openURL(uri).catch(() => Alert.alert(L.attachFailed));
  }

  return (
    <View style={{ marginBottom: space(4) }}>
      <Text style={styles.label}>{L.attachments}</Text>

      {canAttach ? (
        <>
          <View style={styles.actions}>
            <Chip label={L.attachCamera} onPress={() => void add(takePhoto)} />
            <Chip label={L.attachGallery} onPress={() => void add(pickImage)} />
            <Chip label={L.attachFile} onPress={() => void add(pickDocument)} />
          </View>

          {busy ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: space(3) }} />
          ) : null}

          {value.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.strip}>
                {value.map((a) => (
                  <View key={a.id} style={styles.tile}>
                    <Pressable onPress={() => void open(a)} style={styles.tileBody}>
                      {previews[a.id] ? (
                        <Image
                          source={{ uri: previews[a.id] }}
                          style={styles.thumb}
                          resizeMode="cover"
                        />
                      ) : (
                        <View style={[styles.thumb, styles.thumbPlain]}>
                          <Text style={styles.thumbGlyph}>
                            {a.mime.startsWith('image/') ? '🖼' : '📄'}
                          </Text>
                        </View>
                      )}
                    </Pressable>
                    <Pressable
                      onPress={() => remove(a)}
                      hitSlop={space(2)}
                      accessibilityRole="button"
                      accessibilityLabel={L.attachRemoveTitle}
                      style={styles.removeBtn}
                    >
                      <Text style={styles.removeText}>×</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            </ScrollView>
          ) : (
            <Text style={styles.hint}>{L.attachHint}</Text>
          )}
        </>
      ) : (
        <Text style={styles.hint}>{L.attachNeedsAccount}</Text>
      )}
    </View>
  );
}

function Chip({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.chip, pressed && { opacity: 0.7 }]}
    >
      <Text style={styles.chipText}>{label}</Text>
    </Pressable>
  );
}

const THUMB = 76;

const styles = StyleSheet.create({
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSoft,
    marginBottom: space(1.5),
  },
  actions: { flexDirection: 'row', gap: space(2), flexWrap: 'wrap' },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingVertical: space(2),
    paddingHorizontal: space(3),
  },
  chipText: { fontSize: 14, fontWeight: '600', color: colors.text },
  hint: { fontSize: 13, color: colors.textSoft, marginTop: space(2) },
  strip: { flexDirection: 'row', gap: space(2.5), marginTop: space(3) },
  tile: { width: THUMB, height: THUMB },
  tileBody: { flex: 1 },
  thumb: {
    width: THUMB,
    height: THUMB,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  thumbPlain: { alignItems: 'center', justifyContent: 'center' },
  thumbGlyph: { fontSize: 26 },
  removeBtn: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeText: { color: '#fff', fontSize: 15, fontWeight: '700', lineHeight: 17 },
});
