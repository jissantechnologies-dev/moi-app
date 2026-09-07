import React, { useState } from 'react';
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
import { Button, Field, PasswordField } from '../components/ui';
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

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
        onSignedIn(await api.login(email.trim(), password));
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

          {error ? <Text style={styles.error}>{error}</Text> : null}
          {notice ? <Text style={styles.notice}>{notice}</Text> : null}

          {busy ? (
            <ActivityIndicator color={colors.primary} style={{ marginVertical: space(3) }} />
          ) : (
            <Button title={mode === 'signIn' ? L.signIn : L.signUp} onPress={submit} />
          )}

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
