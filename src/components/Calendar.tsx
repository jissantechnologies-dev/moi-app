import React, { useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { fromISODate, monthGrid, toISODate } from '../format';
import { t } from '../i18n';
import { colors, radius, space } from '../theme';
import { Lang } from '../types';

/**
 * A month grid built from plain views, so the same picker works on Android,
 * iOS and in the browser preview.
 */

export default function Calendar({
  visible,
  lang,
  value,
  onSelect,
  onClose,
}: {
  visible: boolean;
  lang: Lang;
  /** Currently selected date as YYYY-MM-DD. */
  value: string;
  onSelect: (iso: string) => void;
  onClose: () => void;
}) {
  const L = t(lang);
  const selected = fromISODate(value);
  const [cursor, setCursor] = useState({
    year: selected.getFullYear(),
    month: selected.getMonth(),
  });

  // Year picker: a paged grid of 12 years, opened by tapping the header title.
  const [yearView, setYearView] = useState(false);
  const [yearPage, setYearPage] = useState(() => Math.floor(cursor.year / 12) * 12);

  function openYearView() {
    setYearPage(Math.floor(cursor.year / 12) * 12);
    setYearView(true);
  }

  // Re-open on the month of whatever is currently selected.
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    setCursor({ year: selected.getFullYear(), month: selected.getMonth() });
    setYearView(false);
  }

  const cells = useMemo(
    () => monthGrid(cursor.year, cursor.month),
    [cursor.year, cursor.month]
  );
  const todayIso = toISODate(new Date());

  function shift(by: number) {
    if (yearView) {
      setYearPage((p) => p + by * 12);
      return;
    }
    const d = new Date(cursor.year, cursor.month + by, 1);
    setCursor({ year: d.getFullYear(), month: d.getMonth() });
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.wrap} pointerEvents="box-none">
        <View style={styles.card}>
          <View style={styles.header}>
            <Pressable
              onPress={() => shift(-1)}
              hitSlop={10}
              style={styles.arrow}
              accessibilityLabel={yearView ? L.prevYears : L.prevMonth}
            >
              <Text style={styles.arrowText}>‹</Text>
            </Pressable>
            <Pressable
              onPress={() => (yearView ? setYearView(false) : openYearView())}
              hitSlop={8}
              accessibilityLabel={L.chooseYear}
            >
              <Text style={styles.headerTitle}>
                {yearView
                  ? `${yearPage} – ${yearPage + 11}`
                  : `${L.monthsLong[cursor.month]} ${cursor.year}`}
                {' ▾'}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => shift(1)}
              hitSlop={10}
              style={styles.arrow}
              accessibilityLabel={yearView ? L.nextYears : L.nextMonth}
            >
              <Text style={styles.arrowText}>›</Text>
            </Pressable>
          </View>

          {yearView ? (
            <View style={styles.grid}>
              {Array.from({ length: 12 }, (_, i) => yearPage + i).map((y) => {
                const isSelected = y === cursor.year;
                return (
                  <Pressable
                    key={y}
                    style={({ pressed }) => [
                      styles.yearCell,
                      isSelected && styles.cellSelected,
                      pressed && !isSelected && { opacity: 0.6 },
                    ]}
                    onPress={() => {
                      setCursor((c) => ({ ...c, year: y }));
                      setYearView(false);
                    }}
                  >
                    <Text
                      style={[styles.cellText, isSelected && styles.cellTextSelected]}
                    >
                      {y}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : (
            <>
            <View style={styles.week}>
              {L.weekdaysShort.map((d, i) => (
                <Text key={i} style={styles.weekday}>
                  {d}
                </Text>
              ))}
            </View>

            <View style={styles.grid}>
              {cells.map((cell, i) => {
                if (!cell) return <View key={i} style={styles.cell} />;
                const isSelected = cell.iso === value;
                const isToday = cell.iso === todayIso;
                return (
                  <Pressable
                    key={i}
                    style={({ pressed }) => [
                      styles.cell,
                      isSelected && styles.cellSelected,
                      !isSelected && isToday && styles.cellToday,
                      pressed && !isSelected && { opacity: 0.6 },
                    ]}
                    onPress={() => onSelect(cell.iso)}
                  >
                    <Text
                      style={[styles.cellText, isSelected && styles.cellTextSelected]}
                    >
                      {cell.day}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            </>
          )}

          <View style={styles.footer}>
            <Pressable onPress={() => onSelect(todayIso)} hitSlop={8}>
              <Text style={styles.footerAction}>{L.today}</Text>
            </Pressable>
            <Pressable onPress={onClose} hitSlop={8}>
              <Text style={[styles.footerAction, styles.footerClose]}>
                {L.cancel}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...(StyleSheet.absoluteFill as object), backgroundColor: 'rgba(0,0,0,0.35)' },
  wrap: {
    ...(StyleSheet.absoluteFill as object),
    alignItems: 'center',
    justifyContent: 'center',
    padding: space(4),
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: space(4),
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: space(3),
  },
  headerTitle: { fontSize: 16, fontWeight: '800', color: colors.text },
  arrow: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
  },
  arrowText: {
    fontSize: 24,
    lineHeight: 26,
    color: colors.primary,
    fontWeight: '700',
    marginTop: -2,
  },
  week: { flexDirection: 'row', marginBottom: space(1) },
  weekday: {
    flex: 1,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSoft,
    paddingVertical: space(1.5),
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
  },
  yearCell: {
    width: '33.333%',
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
  },
  cellSelected: { backgroundColor: colors.primary },
  cellToday: { borderWidth: 1, borderColor: colors.primary },
  cellText: { fontSize: 15, color: colors.text },
  cellTextSelected: { color: '#fff', fontWeight: '800' },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: space(3),
    paddingTop: space(3),
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  footerAction: { fontSize: 15, fontWeight: '700', color: colors.primary },
  footerClose: { color: colors.textSoft },
});
