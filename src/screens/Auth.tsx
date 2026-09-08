import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as api from '../api';
import { Button, Checkbox, Field, PasswordField } from '../components/ui';
import { t } from '../i18n';
import { colors, radius, space } from '../theme';
import { Lang } from '../types';

type Mode = 'signIn' | 'signUp';

const EMAIL_RE = /^[^@\s]+@[^@\s.]+\.[^@\s]+$/;

export default function Auth({
  lang,
  onSignedIn,
  onSkip,
}: {
  lang: Lang;
  onSignedIn: (user: api.SessionUser) => void;
  /** Lets someone keep using the book on this device without an account. */
  onSkip: () => void;
}) {
  const L = t(lang);
  const insets = useSafeAreaInsets();

  const [mode, setMode] = useState<Mode>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [googleReady, setGoogleReady] = useState(false);

  // Google appears only when the server has credentials for it, and only on the
  // web, where a redirect has somewhere to come back to.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    let live = true;
    void api
      .authConfig()
      .then((c) => {
        if (live) setGoogleReady(c.google);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  function validate(): string | null {
    if (!EMAIL_RE.test(email.trim())) return L.emailInvalid;
    if (password.length < 8) return L.passwordTooShort;
    return null;
  }

  async function submit() {
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }

    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (mode === 'signUp') {
        const message = await api.register(email.trim(), password);
        setNotice(message);
        setMode('signIn');
      } else {
        onSignedIn(await api.login(email.trim(), password, remember));
      }
    } catch (err) {
      setError(
        err instanceof api.ApiError
          ? err.message
          : // A network failure is the common case here, not a bad password.
            L.offlineNotice
      );
    } finally {
      setBusy(false);
    }
  }

  async function forgot() {
    if (!EMAIL_RE.test(email.trim())) {
      setError(L.emailInvalid);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setNotice(await api.forgotPassword(email.trim()));
    } catch {
      setNotice(L.resetSent);
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + space(12), paddingBottom: insets.bottom + space(8) },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.centred}>
        <Text style={styles.title}>{L.appName}</Text>
        <Text style={styles.tagline}>{L.authIntro}</Text>

        <View style={styles.card}>
          <Field
            label={L.email}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="emailAddress"
          />
          <PasswordField
            label={L.password}
            revealLabel={L.showPassword}
            hideLabel={L.hidePassword}
            value={password}
            onChangeText={setPassword}
            autoCapitalize="none"
            textContentType={mode === 'signUp' ? 'newPassword' : 'password'}
          />

          {mode === 'signIn' ? (
            <Checkbox
              label={L.rememberMe}
              checked={remember}
              onChange={setRemember}
            />
          ) : null}

          {error ? <Text style={styles.error}>{error}</Text> : null}
          {notice ? <Text style={styles.notice}>{notice}</Text> : null}

          {busy ? (
            <ActivityIndicator color={colors.primary} style={{ marginVertical: space(3) }} />
          ) : (
            <Button title={mode === 'signIn' ? L.signIn : L.signUp} onPress={submit} />
          )}

          {googleReady ? (
            <>
              <View style={styles.orRow}>
                <View style={styles.orLine} />
                <Text style={styles.orText}>{L.or}</Text>
                <View style={styles.orLine} />
              </View>
              <Pressable
                // A full page navigation, not a popup: the site is
                // cross-origin isolated for the sake of SQLite, and that
                // severs the opener a popup would need to answer through.
                onPress={() => {
                  window.location.href = api.googleSignInUrl();
                }}
                style={({ pressed }) => [styles.googleBtn, pressed && { opacity: 0.75 }]}
              >
                <Text style={styles.googleMark}>G</Text>
                <Text style={styles.googleText}>{L.continueWithGoogle}</Text>
              </Pressable>
            </>
          ) : null}

          <Pressable
            onPress={() => {
              setMode(mode === 'signIn' ? 'signUp' : 'signIn');
              setError(null);
              setNotice(null);
            }}
          >
            <Text style={styles.link}>
              {mode === 'signIn' ? L.noAccount : L.haveAccount}
            </Text>
          </Pressable>

          {mode === 'signIn' ? (
            <Pressable onPress={forgot}>
              <Text style={styles.linkSoft}>{L.forgotPassword}</Text>
            </Pressable>
          ) : null}
        </View>

        <Pressable onPress={onSkip}>
          <Text style={styles.linkSoft}>{L.continueOffline}</Text>
        </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: space(5),
    flexGrow: 1,
  },
  /**
   * Centres the card without breaking scrolling. justifyContent: 'center' on a
   * scroll container looks the same until the content is taller than the
   * window: it then overflows off both ends, and nothing can scroll above the
   * top of a scroll area, so the title becomes unreachable on a short screen.
   * Auto margins collapse to zero once the content stops fitting, so the form
   * simply starts at the top and scrolls.
   */
  centred: { width: '100%', marginVertical: 'auto' },
  orRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(3),
    marginTop: space(4),
    marginBottom: space(3),
  },
  orLine: { flex: 1, height: 1, backgroundColor: colors.border },
  orText: { fontSize: 12, fontWeight: '600', color: colors.textSoft },
  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space(2.5),
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingVertical: space(3.5),
  },
  googleMark: { fontSize: 17, fontWeight: '800', color: '#4285F4' },
  googleText: { fontSize: 15, fontWeight: '600', color: colors.text },
  title: {
    fontSize: 30,
    fontWeight: '700',
    color: colors.primary,
    textAlign: 'center',
  },
  tagline: {
    fontSize: 14,
    color: colors.textSoft,
    textAlign: 'center',
    marginTop: space(2),
    marginBottom: space(6),
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space(5),
    marginBottom: space(5),
  },
  error: {
    color: colors.primary,
    fontSize: 13,
    marginBottom: space(3),
  },
  notice: {
    color: colors.received,
    fontSize: 13,
    marginBottom: space(3),
  },
  link: {
    color: colors.primary,
    fontSize: 14,
    textAlign: 'center',
    marginTop: space(4),
  },
  linkSoft: {
    color: colors.textSoft,
    fontSize: 13,
    textAlign: 'center',
    marginTop: space(3),
  },
});
