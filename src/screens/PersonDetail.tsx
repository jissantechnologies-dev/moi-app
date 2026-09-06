import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { sortByDate, totalsOf } from '../format';
import { t } from '../i18n';
import { colors, radius, space } from '../theme';
import { Direction, Entry, Lang } from '../types';
import { EntryRow, Person, Summary } from './Home';

type Filter = 'all' | Direction;

type Props = {
  lang: Lang;
  person: Person;
  onBack: () => void;
  onOpenEntry: (e: Entry) => void;
};

export default function PersonDetail({
  lang,
  person,
  onBack,
  onOpenEntry,
}: Props) {
  const L = t(lang);
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState<Filter>('all');
  const [newestFirst, setNewestFirst] = useState(true);

  const history = useMemo(() => {
    const kept =
      filter === 'all'
        ? person.entries
        : person.entries.filter((e) => e.direction === filter);
    return sortByDate(kept, newestFirst);
  }, [person.entries, filter, newestFirst]);

  // The card reflects what is currently listed. Under a one-sided filter the
  // balance bars are hidden, since half a history has no balance.
  const totals = useMemo(() => totalsOf(history), [history]);

  const filters: { key: Filter; label: string }[] = [
    { key: 'all', label: L.all },
    { key: 'given', label: L.given },
    { key: 'received', label: L.received },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={[styles.header, { paddingTop: insets.top + space(3) }]}>
        <Pressable onPress={onBack} hitSlop={12}>
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>
            {person.name}
          </Text>
          {person.place || person.phone ? (
            <Text style={styles.sub} numberOfLines={1}>
              {[person.place, person.phone].filter(Boolean).join(' · ')}
            </Text>
          ) : null}
        </View>
      </View>

      <FlatList
        data={history}
        keyExtractor={(e) => e.id}
        contentContainerStyle={{
          paddingHorizontal: space(4),
          paddingBottom: insets.bottom + space(8),
        }}
        ListHeaderComponent={
          <View>
            <Summary totals={totals} lang={lang} showNet={filter === 'all'} />
            <View style={styles.controls}>
              <View style={styles.filters}>
                {filters.map((f) => (
                  <Pressable
                    key={f.key}
                    onPress={() => setFilter(f.key)}
                    style={[styles.chip, filter === f.key && styles.chipActive]}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        filter === f.key && styles.chipTextActive,
                      ]}
                    >
                      {f.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Pressable
                onPress={() => setNewestFirst((v) => !v)}
                hitSlop={8}
                style={styles.sortBtn}
              >
                <Text style={styles.sortText}>
                  {newestFirst ? '↓' : '↑'}{' '}
                  {newestFirst ? L.newestFirst : L.oldestFirst}
                </Text>
              </Pressable>
            </View>
            <Text style={styles.count}>{L.entryCount(history.length)}</Text>
          </View>
        }
        renderItem={({ item }) => (
          <EntryRow entry={item} lang={lang} onPress={() => onOpenEntry(item)} />
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>{L.noneOfThose}</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(3),
    paddingHorizontal: space(4),
    paddingBottom: space(3),
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  back: { fontSize: 34, lineHeight: 36, color: colors.primary, marginTop: -6 },
  title: { fontSize: 19, fontWeight: '800', color: colors.text },
  sub: { fontSize: 13, color: colors.textSoft, marginTop: 1 },

  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: space(2),
    marginTop: space(4),
  },
  filters: { flexDirection: 'row', gap: space(2) },
  chip: {
    paddingHorizontal: space(3.5),
    paddingVertical: space(2),
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.text, borderColor: colors.text },
  chipText: { fontSize: 13, fontWeight: '600', color: colors.textSoft },
  chipTextActive: { color: '#fff' },
  sortBtn: {
    paddingHorizontal: space(3),
    paddingVertical: space(2),
    borderRadius: radius.sm,
    backgroundColor: colors.primarySoft,
  },
  sortText: { fontSize: 12, fontWeight: '700', color: colors.primary },

  count: {
    fontSize: 12,
    color: colors.textSoft,
    marginTop: space(3),
    marginBottom: space(1),
  },
  empty: { alignItems: 'center', paddingTop: space(10) },
  emptyText: { fontSize: 14, color: colors.textSoft },
});
