import React, { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { t } from '../i18n';
import { colors, radius, space } from '../theme';
import { Lang } from '../types';

const DISMISS_KEY = 'moi.install.dismissed.v1';

/** The event Chrome hands us, stashed on window by the script in index.html. */
type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

type InstallSlot = { event: InstallEvent | null };

function slot(): InstallSlot | undefined {
  return (globalThis as { __moiInstall?: InstallSlot }).__moiInstall;
}

/** True once the app is running from the home screen rather than a browser tab. */
function isInstalled(): boolean {
  if (window.matchMedia?.('(display-mode: standalone)').matches) return true;
  // Safari predates display-mode and reports installation its own way.
  return (window.navigator as { standalone?: boolean }).standalone === true;
}

/**
 * iOS has no beforeinstallprompt, so Safari can only be told where the button
 * is. Chrome and Firefox on iOS cannot install at all, and both put "CriOS" or
 * "FxiOS" in the user agent, so they are excluded rather than shown advice that
 * leads nowhere.
 */
function isIosSafari(): boolean {
  const ua = window.navigator.userAgent;
  const ios = /iPad|iPhone|iPod/.test(ua) ||
    // iPadOS reports itself as a Mac, and is told apart by touch support.
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  return ios && !/CriOS|FxiOS|EdgiOS/.test(ua);
}

function wasDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    // Private mode can refuse storage; showing the banner again is harmless.
    return false;
  }
}

/**
 * The install invitation shown on the web build. Chrome and Edge get a real
 * install button; iOS Safari gets the instructions for its Share menu. Native
 * builds render nothing, as do browsers that offer no way to install.
 */
export default function InstallPrompt({ lang }: { lang: Lang }) {
  const L = t(lang);
  const insets = useSafeAreaInsets();
  const [ready, setReady] = useState(false);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (isInstalled() || wasDismissed()) return;

    if (isIosSafari()) {
      setReady(true);
      setHidden(false);
      return;
    }

    // The event may already have fired before this mounted, or may still be
    // coming, so both cases are handled.
    if (slot()?.event) {
      setReady(true);
      setHidden(false);
    }

    const onAvailable = () => {
      setReady(true);
      setHidden(false);
    };
    const onInstalled = () => setHidden(true);

    window.addEventListener('moi:installavailable', onAvailable);
    window.addEventListener('moi:installed', onInstalled);
    return () => {
      window.removeEventListener('moi:installavailable', onAvailable);
      window.removeEventListener('moi:installed', onInstalled);
    };
  }, []);

  if (Platform.OS !== 'web' || !ready || hidden) return null;

  const iosOnly = isIosSafari();

  const dismiss = () => {
    setHidden(true);
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // Nothing to do; the banner simply reappears next visit.
    }
  };

  const install = async () => {
    const event = slot()?.event;
    if (!event) return;
    // A prompt can only be used once, so it is cleared either way.
    if (slot()) slot()!.event = null;
    setHidden(true);
    try {
      await event.prompt();
      const { outcome } = await event.userChoice;
      // Declining is a deliberate answer, so it is remembered like a dismissal.
      if (outcome === 'dismissed') dismiss();
    } catch {
      setHidden(false);
    }
  };

  return (
    <View
      style={[styles.wrap, { paddingBottom: insets.bottom + space(3) }]}
      // The banner floats over the app, so it must not swallow taps outside it.
      pointerEvents="box-none"
    >
      <View style={styles.card}>
        <View style={styles.textCol}>
          <Text style={styles.title}>{L.installTitle}</Text>
          <Text style={styles.body}>
            {iosOnly ? L.installIosBody : L.installBody}
          </Text>
        </View>
        <View style={styles.actions}>
          <Pressable
            onPress={dismiss}
            accessibilityRole="button"
            style={({ pressed }) => [styles.later, pressed && { opacity: 0.6 }]}
          >
            <Text style={styles.laterText}>{L.installLater}</Text>
          </Pressable>
          {iosOnly ? null : (
            <Pressable
              onPress={install}
              accessibilityRole="button"
              style={({ pressed }) => [styles.cta, pressed && { opacity: 0.85 }]}
            >
              <Text style={styles.ctaText}>{L.installAction}</Text>
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: space(4),
    alignItems: 'center',
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: space(4),
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  textCol: { marginBottom: space(3) },
  title: { fontSize: 16, fontWeight: '700', color: colors.text },
  body: { fontSize: 13, color: colors.textSoft, marginTop: 4, lineHeight: 19 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center' },
  later: { paddingVertical: space(2.5), paddingHorizontal: space(3) },
  laterText: { fontSize: 15, fontWeight: '600', color: colors.textSoft },
  cta: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: space(2.5),
    paddingHorizontal: space(5),
    marginLeft: space(2),
  },
  ctaText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
});
