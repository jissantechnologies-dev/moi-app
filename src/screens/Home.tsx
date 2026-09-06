import React, { useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar } from '../components/ui';
import {
  addToTotals,
  emptyTotals,
  formatDate,
  formatGrams,
  formatRupees,
  fullName,
  initials,
  personKey,
  sortByDate,
  Totals,
  totalsOf,
} from '../format';
import { t } from '../i18n';
import { colors, radius, space } from '../theme';
import { Entry, Lang } from '../types';

export type Person = {
  key: string;
  name: string;
  phone: string;
  place: string;
  totals: Totals;
  entries: Entry[];
};

export function groupByPerson(entries: Entry[]): Person[] {
  const map = new Map<string, Person>();
  for (const e of entries) {
    const key = personKey(e);
    let p = map.get(key);
    if (!p) {
      p = {
        key,
        name: fullName(e) || e.phone,
        phone: e.phone,
        place: e.place,
        totals: emptyTotals(),
        entries: [],
      };
      map.set(key, p);
    }
    // Keep the most complete label we have seen for this person.
    if (fullName(e).length > p.name.length) p.name = fullName(e);
    if (!p.place && e.place) p.place = e.place;
    if (!p.phone && e.phone) p.phone = e.phone;
    addToTotals(p.totals, e);
    p.entries.push(e);
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function matches(e: Entry, q: string): boolean {
  if (!q) return true;
  const hay = [e.firstName, e.lastName, e.phone, e.place, e.functionName]
    .join(' ')
    .toLowerCase();
  return hay.includes(q.toLowerCase());
}

export function Summary({
  totals,
  lang,
  showNet = true,
}: {
  totals: Totals;
  lang: Lang;
  /** A one-sided view has no meaningful balance, so the net bars are hidden. */
  showNet?: boolean;
}) {
  const L = t(lang);
  const net = totals.received - totals.given;
  const goldNet = totals.goldReceived - totals.goldGiven;
  const hasGold = totals.goldGiven > 0 || totals.goldReceived > 0;

  return (
    <View style={styles.summary}>
      <View style={styles.summaryRow}>
        <View style={styles.summaryCell}>
          <Text style={styles.summaryLabel}>{L.given}</Text>
          <Text style={[styles.summaryValue, { color: colors.given }]}>
            {formatRupees(totals.given)}
          </Text>
          {hasGold ? (
            <Text style={[styles.summaryGold, { color: colors.given }]}>
              {L.grams(formatGrams(totals.goldGiven))}
            </Text>
          ) : null}
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryCell}>
          <Text style={styles.summaryLabel}>{L.received}</Text>
          <Text style={[styles.summaryValue, { color: colors.received }]}>
            {formatRupees(totals.received)}
          </Text>
          {hasGold ? (
            <Text style={[styles.summaryGold, { color: colors.received }]}>
              {L.grams(formatGrams(totals.goldReceived))}
            </Text>
          ) : null}
        </View>
      </View>
      {showNet ? (
        <View style={styles.netBar}>
          <Text style={styles.netLabel}>
            {net === 0 ? L.settled : net > 0 ? L.youOwe : L.owedToYou}
          </Text>
          {net !== 0 && (
            <Text style={styles.netValue}>{formatRupees(Math.abs(net))}</Text>
          )}
        </View>
      ) : null}
      {showNet && goldNet !== 0 ? (
        <View style={[styles.netBar, styles.goldBar]}>
          <Text style={[styles.netLabel, { color: colors.gold }]}>
            {goldNet > 0 ? L.goldBehind : L.goldAhead}
          </Text>
          <Text style={[styles.netValue, { color: colors.gold }]}>
            {L.grams(formatGrams(Math.abs(goldNet)))}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

export function EntryRow({
  entry,
  lang,
  onPress,
}: {
  entry: Entry;
  lang: Lang;
  onPress: () => void;
}) {
  const L = t(lang);
  const isGiven = entry.direction === 'given';
  const color = isGiven ? colors.given : colors.received;
  const name = fullName(entry) || entry.phone;
  const sub = [entry.place, entry.functionName].filter(Boolean).join(' · ');
  const isGold = entry.giftKind === 'gold' && entry.goldGrams > 0;

  const meta = [formatDate(entry.functionDate, lang)];
  if (isGold) {
    meta.push(
      `${L.gold} ${L.grams(formatGrams(entry.goldGrams))} · ${entry.goldCarat}K`
    );
  } else if (entry.giftKind === 'item') {
    meta.push(entry.giftNote ? `${L.item}: ${entry.giftNote}` : L.item);
  }

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.7 }]}
    >
      <Avatar text={initials(name)} color={color} />
      <View style={{ flex: 1 }}>
        <Text style={styles.cardName} numberOfLines={1}>
          {name}
        </Text>
        {sub ? (
          <Text style={styles.cardSub} numberOfLines={1}>
            {sub}
          </Text>
        ) : null}
        <Text style={styles.cardMeta} numberOfLines={1}>
          {meta.join(' · ')}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        {isGold ? (
          <Text style={[styles.cardAmount, { color: colors.gold }]}>
            {isGiven ? '−' : '+'}
            {L.grams(formatGrams(entry.goldGrams))}
          </Text>
        ) : null}
        {entry.amount > 0 || !isGold ? (
          <Text
            style={[
              isGold ? styles.cardAmountSmall : styles.cardAmount,
              { color },
            ]}
          >
            {isGiven ? '−' : '+'}
            {formatRupees(entry.amount).replace('Rs. ', '')}
          </Text>
        ) : null}
        <Text style={[styles.cardDir, { color }]}>
          {isGiven ? L.given : L.received}
        </Text>
      </View>
    </Pressable>
  );
}

function PersonRow({
  person,
  lang,
  onPress,
}: {
  person: Person;
  lang: Lang;
  onPress: () => void;
}) {
  const L = t(lang);
  const net = person.totals.received - person.totals.given;
  const goldNet = person.totals.goldReceived - person.totals.goldGiven;
  const color =
    net === 0 ? colors.textSoft : net > 0 ? colors.given : colors.received;

  const hasGold =
    person.totals.goldGiven > 0 || person.totals.goldReceived > 0;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.personCard, pressed && { opacity: 0.7 }]}
    >
      <View style={styles.personTop}>
        <Avatar text={initials(person.name)} color={colors.primary} />
        <View style={{ flex: 1 }}>
          <Text style={styles.cardName} numberOfLines={1}>
            {person.name}
          </Text>
          <Text style={styles.cardSub} numberOfLines={1}>
            {[person.place, person.phone].filter(Boolean).join(' · ')}
          </Text>
          <Text style={styles.cardMeta}>
            {L.entryCount(person.entries.length)}
          </Text>
        </View>
      </View>

      {/* Given and received stay side by side, so the two halves of the
          relationship are readable without opening the person. */}
      <View style={styles.ledger}>
        <View style={styles.ledgerCell}>
          <Text style={styles.ledgerLabel}>{L.given}</Text>
          <Text style={[styles.ledgerValue, { color: colors.given }]}>
            {formatRupees(person.totals.given)}
          </Text>
          {hasGold ? (
            <Text style={[styles.ledgerGold, { color: colors.given }]}>
              {L.grams(formatGrams(person.totals.goldGiven))}
            </Text>
          ) : null}
        </View>

        <View style={styles.ledgerDivider} />

        <View style={styles.ledgerCell}>
          <Text style={styles.ledgerLabel}>{L.received}</Text>
          <Text style={[styles.ledgerValue, { color: colors.received }]}>
            {formatRupees(person.totals.received)}
          </Text>
          {hasGold ? (
            <Text style={[styles.ledgerGold, { color: colors.received }]}>
              {L.grams(formatGrams(person.totals.goldReceived))}
            </Text>
          ) : null}
        </View>

        <View style={styles.ledgerDivider} />

        <View style={styles.ledgerCell}>
          <Text style={styles.ledgerLabel}>{L.balance}</Text>
          <Text style={[styles.ledgerValue, { color }]}>
            {net === 0 ? '—' : formatRupees(Math.abs(net))}
          </Text>
          {goldNet !== 0 ? (
            // Signed, because cash and gold can lean opposite ways: you can owe
            // money and still be owed gold. "+" means it is coming to you.
            <Text style={[styles.ledgerGold, { color: colors.gold }]}>
              {goldNet < 0 ? '+' : '−'}
              {L.grams(formatGrams(Math.abs(goldNet)))}
            </Text>
          ) : null}
          <Text style={[styles.ledgerNote, { color }]} numberOfLines={2}>
            {net === 0 && goldNet === 0
              ? L.settled
              : net > 0
                ? L.youOwe
                : net < 0
                  ? L.owedToYou
                  : goldNet > 0
                    ? L.goldBehind
                    : L.goldAhead}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

type Props = {
  lang: Lang;
  entries: Entry[];
  onAdd: () => void;
  onOpenEntry: (e: Entry) => void;
  onOpenPerson: (p: Person) => void;
  onToggleLang: () => void;
  onOpenMenu: () => void;
};

export default function Home({
  lang,
  entries,
  onAdd,
  onOpenEntry,
  onOpenPerson,
  onToggleLang,
  onOpenMenu,
}: Props) {
  const L = t(lang);
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<'entries' | 'people'>('entries');
  const [query, setQuery] = useState('');

  const filtered = useMemo(
    () => sortByDate(entries.filter((e) => matches(e, query))),
    [entries, query]
  );
  const people = useMemo(() => groupByPerson(filtered), [filtered]);
  const totals = useMemo(() => totalsOf(entries), [entries]);

  const empty = entries.length === 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={[styles.header, { paddingTop: insets.top + space(3) }]}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{L.appName}</Text>
          <Text style={styles.tagline}>{L.tagline}</Text>
        </View>
        <Pressable onPress={onToggleLang} style={styles.headerBtn} hitSlop={8}>
          <Text style={styles.headerBtnText}>
            {lang === 'en' ? 'தமிழ்' : 'EN'}
          </Text>
        </Pressable>
        <Pressable
          onPress={onOpenMenu}
          style={[styles.headerBtn, styles.menuBtn]}
          hitSlop={8}
          accessibilityLabel={L.menu}
        >
          <Text style={styles.headerBtnText}>⋯</Text>
        </Pressable>
      </View>

      <FlatList
        data={tab === 'entries' ? filtered : people}
        keyExtractor={(item: any) => item.id ?? item.key}
        contentContainerStyle={{
          paddingHorizontal: space(4),
          paddingBottom: insets.bottom + space(24),
        }}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View>
            <Summary totals={totals} lang={lang} />
            <TextInput
              style={styles.search}
              value={query}
              onChangeText={setQuery}
              placeholder={L.search}
              placeholderTextColor={colors.textSoft}
            />
            <View style={styles.tabs}>
              {(['entries', 'people'] as const).map((k) => (
                <Pressable
                  key={k}
                  onPress={() => setTab(k)}
                  style={[styles.tab, tab === k && styles.tabActive]}
                >
                  <Text
                    style={[styles.tabText, tab === k && styles.tabTextActive]}
                  >
                    {k === 'entries' ? L.entries : L.people}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        }
        renderItem={({ item }: any) =>
          tab === 'entries' ? (
            <EntryRow
              entry={item as Entry}
              lang={lang}
              onPress={() => onOpenEntry(item as Entry)}
            />
          ) : (
            <PersonRow
              person={item as Person}
              lang={lang}
              onPress={() => onOpenPerson(item as Person)}
            />
          )
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>
              {empty ? L.noEntries : L.noMatches}
            </Text>
            {empty ? <Text style={styles.emptyHint}>{L.noEntriesHint}</Text> : null}
          </View>
        }
      />

      <Pressable
        onPress={onAdd}
        style={({ pressed }) => [
          styles.fab,
          { bottom: insets.bottom + space(6) },
          pressed && { opacity: 0.85 },
        ]}
      >
        <Text style={styles.fabText}>+</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(2),
    paddingHorizontal: space(4),
    paddingBottom: space(3),
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: { fontSize: 22, fontWeight: '800', color: colors.primary },
  tagline: { fontSize: 13, color: colors.textSoft, marginTop: 2 },
  headerBtn: {
    paddingHorizontal: space(3),
    paddingVertical: space(2),
    borderRadius: radius.sm,
    backgroundColor: colors.primarySoft,
  },
  menuBtn: { paddingHorizontal: space(3.5) },
  headerBtnText: { color: colors.primary, fontWeight: '700', fontSize: 13 },

  summary: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: space(4),
    overflow: 'hidden',
  },
  summaryRow: { flexDirection: 'row', paddingVertical: space(4) },
  summaryCell: { flex: 1, alignItems: 'center' },
  summaryDivider: { width: 1, backgroundColor: colors.border },
  summaryLabel: { fontSize: 13, color: colors.textSoft, marginBottom: 4 },
  summaryValue: { fontSize: 19, fontWeight: '800' },
  summaryGold: { fontSize: 12, fontWeight: '600', marginTop: 2, opacity: 0.85 },
  netBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space(2),
    paddingVertical: space(3),
    backgroundColor: colors.primarySoft,
  },
  goldBar: {
    backgroundColor: '#FBF1DC',
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  netLabel: { fontSize: 13, color: colors.primary, fontWeight: '600' },
  netValue: { fontSize: 15, color: colors.primary, fontWeight: '800' },

  search: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: space(3.5),
    paddingVertical: space(3),
    fontSize: 15,
    color: colors.text,
    marginTop: space(4),
  },
  tabs: {
    flexDirection: 'row',
    gap: space(2),
    marginTop: space(4),
    marginBottom: space(2),
  },
  tab: {
    paddingHorizontal: space(4),
    paddingVertical: space(2),
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabActive: { backgroundColor: colors.text, borderColor: colors.text },
  tabText: { fontSize: 14, fontWeight: '600', color: colors.textSoft },
  tabTextActive: { color: '#fff' },

  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(3),
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: space(3.5),
    marginTop: space(2.5),
  },
  personCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: space(3.5),
    marginTop: space(2.5),
  },
  personTop: { flexDirection: 'row', alignItems: 'center', gap: space(3) },
  ledger: {
    flexDirection: 'row',
    marginTop: space(3),
    paddingTop: space(3),
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  ledgerCell: { flex: 1, alignItems: 'center', paddingHorizontal: space(1) },
  ledgerDivider: { width: 1, backgroundColor: colors.border },
  ledgerLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSoft,
    marginBottom: 3,
  },
  ledgerValue: { fontSize: 15, fontWeight: '800' },
  ledgerGold: { fontSize: 11, fontWeight: '700', marginTop: 1, opacity: 0.85 },
  ledgerNote: {
    fontSize: 10,
    fontWeight: '600',
    marginTop: 2,
    textAlign: 'center',
  },
  cardName: { fontSize: 16, fontWeight: '700', color: colors.text },
  cardSub: { fontSize: 13, color: colors.textSoft, marginTop: 1 },
  cardMeta: { fontSize: 12, color: colors.textSoft, marginTop: 2 },
  cardAmount: { fontSize: 16, fontWeight: '800' },
  cardAmountSmall: { fontSize: 13, fontWeight: '700', marginTop: 1 },
  cardDir: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
    maxWidth: 110,
    textAlign: 'right',
  },

  empty: { alignItems: 'center', paddingTop: space(16) },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  emptyHint: { fontSize: 14, color: colors.textSoft, marginTop: space(2) },

  fab: {
    position: 'absolute',
    right: space(5),
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  fabText: { color: '#fff', fontSize: 32, fontWeight: '300', marginTop: -3 },
});
