import * as DocumentPicker from 'expo-document-picker';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Platform, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as api from './src/api';
import MenuSheet, { MenuAction } from './src/components/MenuSheet';
import { exportBackup, exportCsv, parseBackup, readPickedFile } from './src/export';
import { t } from './src/i18n';
import Auth from './src/screens/Auth';
import EntryForm from './src/screens/EntryForm';
import Home, { groupByPerson, Person } from './src/screens/Home';
import PersonDetail from './src/screens/PersonDetail';
import {
  deleteEntry,
  loadEntries,
  loadSettings,
  saveEntries,
  saveSettings,
  upsertEntry,
} from './src/storage';
import { adoptOwner, syncInBackground } from './src/sync';
import { colors } from './src/theme';
import { Entry, Lang } from './src/types';

type Route =
  | { name: 'home' }
  | { name: 'form'; entry?: Entry }
  | { name: 'person'; key: string };

export default function App() {
  const [ready, setReady] = useState(false);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [lang, setLang] = useState<Lang>('en');
  const [route, setRoute] = useState<Route>({ name: 'home' });
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  // null = not signed in. 'skipped' means the user chose device-only use.
  const [user, setUser] = useState<api.SessionUser | null>(null);
  const [skippedAuth, setSkippedAuth] = useState(false);
  const L = t(lang);

  useEffect(() => {
    (async () => {
      const [e, s] = await Promise.all([loadEntries(), loadSettings()]);
      setEntries(e);
      setLang(s.lang);

      // A redirect back from Google carries a code that signs someone in
      // outright, so it is spent before the stored session is consulted.
      const fromRedirect = await consumeUrlParams().catch(() => null);
      if (fromRedirect) {
        setUser(fromRedirect);
        await adoptOwner(fromRedirect.id);
        syncInBackground(setEntries);
        setReady(true);
        return;
      }

      // Show the cached book straight away, then reconcile with the server.
      // A stored session survives a page reload, which is what makes the data
      // still be there when someone comes back to the page.
      if (await api.loadSession()) {
        try {
          const account = await api.me();
          setUser(account);
          await adoptOwner(account.id);
          syncInBackground(setEntries);
        } catch {
          // Expired or offline: fall back to the local cache and let the user
          // sign in again when they want to.
          await api.clearSession();
        }
      }
      setReady(true);
    })();
  }, []);

  function persist(next: Entry[]) {
    setEntries(next);
    void saveEntries(next);
    syncInBackground(setEntries);
  }

  function upsert(entry: Entry) {
    const exists = entries.some((e) => e.id === entry.id);
    setEntries(
      exists ? entries.map((e) => (e.id === entry.id ? entry : e)) : [entry, ...entries]
    );
    // One row rather than a whole-book rewrite, so tombstones survive.
    void upsertEntry(entry);
    syncInBackground(setEntries);
    setRoute({ name: 'home' });
  }

  function remove(id: string) {
    setEntries(entries.filter((e) => e.id !== id));
    void deleteEntry(id);
    syncInBackground(setEntries);
    setRoute({ name: 'home' });
  }

  function toggleLang() {
    const next: Lang = lang === 'en' ? 'ta' : 'en';
    setLang(next);
    void saveSettings({ lang: next });
    if (user) void api.pushSettings(next).catch(() => {});
  }

  /**
   * Handles the links and redirects that land back on the app: the one-time
   * code from Google sign-in, and the confirmation and password-reset links
   * sent by email. Each is consumed once and then wiped from the address bar,
   * so a reload or a shared URL cannot replay it.
   *
   * Returns the account when a redirect signed someone in, so the caller can
   * skip the stored-session path it would otherwise take.
   */
  async function consumeUrlParams(): Promise<api.SessionUser | null> {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return null;

    const params = new URLSearchParams(window.location.search);
    const code = params.get('auth');
    const verify = params.get('verify');
    const failed = params.get('authError');
    if (!code && !verify && !failed) return null;

    const clean = () =>
      window.history.replaceState({}, '', window.location.pathname);

    if (failed) {
      clean();
      Alert.alert(failed === 'google_unverified' ? L.googleUnverified : L.googleFailed);
      return null;
    }

    if (verify) {
      clean();
      try {
        await api.verifyEmail(verify);
        Alert.alert(L.emailConfirmed);
      } catch {
        Alert.alert(L.emailConfirmFailed);
      }
      return null;
    }

    clean();
    try {
      return await api.exchangeAuthCode(code!);
    } catch {
      Alert.alert(L.googleFailed);
      return null;
    }
  }

  async function signIn(account: api.SessionUser) {
    setUser(account);
    await adoptOwner(account.id);
    const synced = await import('./src/sync').then((m) => m.syncNow()).catch(() => null);
    if (synced) setEntries(synced);
    else setEntries(await loadEntries());
  }

  async function signOut() {
    await api.logout();
    setUser(null);
    setSkippedAuth(false);
    // The cached book stays on the device; the next sign-in decides whether it
    // belongs to that account or gets replaced.
    setEntries(await loadEntries());
  }

  async function pickAndRestore() {
    const picked = await DocumentPicker.getDocumentAsync({
      // Some file managers hand JSON back as an octet-stream, so stay permissive
      // and validate the contents instead.
      type: '*/*',
      copyToCacheDirectory: true,
    });
    if (picked.canceled || !picked.assets?.length) return;

    const restored = parseBackup(await readPickedFile(picked.assets[0].uri));
    if (!restored) {
      Alert.alert(L.restoreBad);
      return;
    }

    Alert.alert(L.restoreTitle, L.restoreBody(entries.length), [
      { text: L.cancel, style: 'cancel' },
      {
        text: L.restore,
        style: 'destructive',
        onPress: () => {
          persist(restored);
          setRoute({ name: 'home' });
          Alert.alert(L.restoreDone(restored.length));
        },
      },
    ]);
  }

  async function runMenuAction(action: MenuAction) {
    if (action === 'signout') {
      setMenuOpen(false);
      await signOut();
      return;
    }
    if (action !== 'restore' && entries.length === 0) {
      Alert.alert(L.nothingToExport);
      return;
    }
    setBusy(true);
    try {
      if (action === 'csv') await exportCsv(entries);
      else if (action === 'backup') await exportBackup(entries);
      else await pickAndRestore();
      setMenuOpen(false);
    } catch {
      Alert.alert(L.exportFailed);
    } finally {
      setBusy(false);
    }
  }

  // Recomputed from the live entry list so the person screen stays correct
  // after an edit or delete.
  const people = useMemo(() => groupByPerson(entries), [entries]);
  const activePerson: Person | undefined =
    route.name === 'person' ? people.find((p) => p.key === route.key) : undefined;

  useEffect(() => {
    if (route.name === 'person' && !activePerson) setRoute({ name: 'home' });
  }, [route, activePerson]);

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      {!ready ? (
        <View
          style={{
            flex: 1,
            backgroundColor: colors.bg,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : !user && !skippedAuth ? (
        <Auth
          lang={lang}
          onSignedIn={signIn}
          onSkip={() => setSkippedAuth(true)}
        />
      ) : route.name === 'form' ? (
        <EntryForm
          lang={lang}
          initial={route.entry}
          onSave={upsert}
          onCancel={() => setRoute({ name: 'home' })}
          onDelete={route.entry ? remove : undefined}
          canAttach={Boolean(user)}
        />
      ) : activePerson ? (
        <PersonDetail
          lang={lang}
          person={activePerson}
          onBack={() => setRoute({ name: 'home' })}
          onOpenEntry={(entry) => setRoute({ name: 'form', entry })}
        />
      ) : (
        <Home
          lang={lang}
          entries={entries}
          onAdd={() => setRoute({ name: 'form' })}
          onOpenEntry={(entry) => setRoute({ name: 'form', entry })}
          onOpenPerson={(p) => setRoute({ name: 'person', key: p.key })}
          onToggleLang={toggleLang}
          onOpenMenu={() => setMenuOpen(true)}
        />
      )}
      <MenuSheet
        visible={menuOpen}
        lang={lang}
        busy={busy}
        accountEmail={user?.email ?? null}
        onSelect={runMenuAction}
        onClose={() => setMenuOpen(false)}
      />
    </SafeAreaProvider>
  );
}
