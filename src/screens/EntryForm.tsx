import React, { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Calendar from '../components/Calendar';
import { Button, Field, Segmented } from '../components/ui';
import { contactsSupported, pickContact } from '../contacts';
import { formatDate, toISODate } from '../format';
import { t } from '../i18n';
import { colors, radius, space } from '../theme';
import { Carat, CARATS, Direction, Entry, GiftKind, Lang } from '../types';

type Props = {
  lang: Lang;
  initial?: Entry;
  onSave: (e: Entry) => void;
  onCancel: () => void;
  onDelete?: (id: string) => void;
};

const newId = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export default function EntryForm({
  lang,
  initial,
  onSave,
  onCancel,
  onDelete,
}: Props) {
  const L = t(lang);
  const insets = useSafeAreaInsets();

  const [firstName, setFirstName] = useState(initial?.firstName ?? '');
  const [lastName, setLastName] = useState(initial?.lastName ?? '');
  const [phone, setPhone] = useState(initial?.phone ?? '');
  const [place, setPlace] = useState(initial?.place ?? '');
  const [functionName, setFunctionName] = useState(initial?.functionName ?? '');
  const [functionDate, setFunctionDate] = useState(
    initial?.functionDate ?? toISODate(new Date())
  );
  const [direction, setDirection] = useState<Direction>(
    initial?.direction ?? 'given'
  );
  const [giftKind, setGiftKind] = useState<GiftKind>(initial?.giftKind ?? 'cash');
  const [amount, setAmount] = useState(
    initial && initial.amount ? String(initial.amount) : ''
  );
  const [goldGrams, setGoldGrams] = useState(
    initial?.goldGrams ? String(initial.goldGrams) : ''
  );
  const [goldCarat, setGoldCarat] = useState<Carat>(initial?.goldCarat ?? 22);
  const [giftNote, setGiftNote] = useState(initial?.giftNote ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [showPicker, setShowPicker] = useState(false);

  function submit() {
    if (!firstName.trim()) {
      Alert.alert(L.requiredName);
      return;
    }
    onSave({
      id: initial?.id ?? newId(),
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      phone: phone.trim(),
      place: place.trim(),
      functionName: functionName.trim(),
      functionDate,
      direction,
      giftKind,
      amount: Number(amount.replace(/[^\d.]/g, '')) || 0,
      goldGrams:
        giftKind === 'gold' ? Number(goldGrams.replace(/[^\d.]/g, '')) || 0 : 0,
      goldCarat,
      giftNote: giftNote.trim(),
      notes: notes.trim(),
      createdAt: initial?.createdAt ?? Date.now(),
      // Stamped on every save so the server can order this against other devices.
      updatedAt: Date.now(),
      deleted: false,
    });
  }

  async function chooseFromContacts() {
    const result = await pickContact();
    switch (result.status) {
      case 'picked':
        setPhone(result.contact.phone);
        // Only fill names that are still blank, so a typed name is never lost.
        if (!firstName.trim()) setFirstName(result.contact.firstName);
        if (!lastName.trim()) setLastName(result.contact.lastName);
        break;
      case 'denied':
        Alert.alert(L.contactsDenied);
        break;
      case 'no-number':
        Alert.alert(L.contactsNoNumber);
        break;
      case 'unsupported':
        Alert.alert(L.contactsWeb);
        break;
      case 'error':
        Alert.alert(L.contactsFailed);
        break;
      case 'cancelled':
        break;
    }
  }

  function confirmDelete() {
    if (!initial || !onDelete) return;
    Alert.alert(L.deleteTitle, L.deleteBody, [
      { text: L.cancel, style: 'cancel' },
      {
        text: L.delete,
        style: 'destructive',
        onPress: () => onDelete(initial.id),
      },
    ]);
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.header, { paddingTop: insets.top + space(3) }]}>
        <Pressable onPress={onCancel} hitSlop={12}>
          <Text style={styles.headerAction}>{L.cancel}</Text>
        </Pressable>
        <Text style={styles.headerTitle}>
          {initial ? L.editEntry : L.addEntry}
        </Text>
        <Pressable onPress={submit} hitSlop={12}>
          <Text style={[styles.headerAction, styles.headerSave]}>{L.save}</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{
          padding: space(4),
          paddingBottom: insets.bottom + space(12),
        }}
        keyboardShouldPersistTaps="handled"
      >
        <Segmented
          label={L.direction}
          value={direction}
          onChange={setDirection}
          activeColor={direction === 'given' ? colors.given : colors.received}
          options={[
            { value: 'given', label: L.directionGiven },
            { value: 'received', label: L.directionReceived },
          ]}
        />

        <View style={styles.row}>
          <View style={styles.rowItem}>
            <Field
              label={L.firstName}
              value={firstName}
              onChangeText={setFirstName}
              autoCapitalize="words"
            />
          </View>
          <View style={styles.rowItem}>
            <Field
              label={L.lastName}
              value={lastName}
              onChangeText={setLastName}
              autoCapitalize="words"
            />
          </View>
        </View>

        <View style={styles.phoneRow}>
          <View style={{ flex: 1 }}>
            <Field
              label={L.phone}
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
            />
          </View>
          {contactsSupported ? (
            <Pressable
              onPress={chooseFromContacts}
              style={({ pressed }) => [
                styles.contactsBtn,
                pressed && { opacity: 0.7 },
              ]}
            >
              <Text style={styles.contactsBtnText}>{L.fromContacts}</Text>
            </Pressable>
          ) : null}
        </View>
        <Field
          label={L.place}
          value={place}
          onChangeText={setPlace}
          autoCapitalize="words"
        />
        <Field
          label={L.functionName}
          value={functionName}
          onChangeText={setFunctionName}
          placeholder={L.functionNamePh}
        />

        <Text style={styles.label}>{L.functionDate}</Text>
        <Pressable style={styles.dateBox} onPress={() => setShowPicker(true)}>
          <Text style={styles.dateText}>{formatDate(functionDate, lang)}</Text>
        </Pressable>
        <Calendar
          visible={showPicker}
          lang={lang}
          value={functionDate}
          onSelect={(iso) => {
            setFunctionDate(iso);
            setShowPicker(false);
          }}
          onClose={() => setShowPicker(false)}
        />

        <View style={{ height: space(4) }} />

        <Segmented
          label={L.giftKind}
          value={giftKind}
          onChange={setGiftKind}
          options={[
            { value: 'cash', label: L.cash },
            { value: 'gold', label: L.gold },
            { value: 'item', label: L.item },
          ]}
        />

        {giftKind === 'gold' && (
          <View style={styles.row}>
            <View style={styles.rowItem}>
              <Field
                label={L.goldWeight}
                value={goldGrams}
                onChangeText={setGoldGrams}
                keyboardType="decimal-pad"
                placeholder="8"
              />
            </View>
            <View style={styles.rowItem}>
              <Segmented
                label={L.goldCarat}
                value={String(goldCarat)}
                onChange={(v) => setGoldCarat(Number(v) as Carat)}
                activeColor={colors.gold}
                options={CARATS.map((c) => ({
                  value: String(c),
                  label: `${c}K`,
                }))}
              />
            </View>
          </View>
        )}

        <Field
          label={giftKind === 'gold' ? L.goldValue : L.amount}
          value={amount}
          onChangeText={setAmount}
          keyboardType="numeric"
          placeholder="0"
        />

        {giftKind !== 'cash' && (
          <Field
            label={L.giftNote}
            value={giftNote}
            onChangeText={setGiftNote}
            placeholder={giftKind === 'gold' ? L.giftNotePhGold : L.giftNotePhItem}
          />
        )}

        <Field label={L.notes} value={notes} onChangeText={setNotes} multiline />

        <Button title={L.save} onPress={submit} />

        {initial && onDelete ? (
          <Pressable onPress={confirmDelete} style={styles.deleteBtn}>
            <Text style={styles.deleteText}>{L.delete}</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space(4),
    paddingBottom: space(3),
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  headerAction: { fontSize: 16, color: colors.textSoft },
  headerSave: { color: colors.primary, fontWeight: '700' },
  row: { flexDirection: 'row', gap: space(3) },
  rowItem: { flex: 1 },
  phoneRow: { flexDirection: 'row', alignItems: 'flex-end', gap: space(2.5) },
  contactsBtn: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.md,
    paddingHorizontal: space(4),
    // Matches the height of the input it sits beside.
    paddingVertical: space(3) + 1,
    marginBottom: space(4),
  },
  contactsBtnText: { color: colors.primary, fontWeight: '700', fontSize: 14 },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSoft,
    marginBottom: space(1.5),
  },
  dateBox: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: space(3.5),
    paddingVertical: space(3.5),
  },
  dateText: { fontSize: 16, color: colors.text },
  deleteBtn: { alignItems: 'center', paddingVertical: space(4) },
  deleteText: { color: colors.primary, fontSize: 15, fontWeight: '600' },
});
