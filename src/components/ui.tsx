import React, { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from 'react-native';
import { colors, radius, space } from '../theme';

export function Field({
  label,
  ...props
}: TextInputProps & { label: string }) {
  return (
    <View style={{ marginBottom: space(4) }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.textSoft}
        {...props}
        style={[styles.input, props.multiline && styles.inputMulti, props.style]}
      />
    </View>
  );
}

/**
 * A password box with an eye that reveals what was typed. The slash across the
 * eye is a rotated line rather than a second glyph, because the "no entry" and
 * "crossed eye" emoji render inconsistently across platforms and one of them
 * is a monkey on several of them.
 */
export function PasswordField({
  label,
  revealLabel,
  hideLabel,
  ...props
}: TextInputProps & { label: string; revealLabel: string; hideLabel: string }) {
  const [shown, setShown] = useState(false);
  return (
    <View style={{ marginBottom: space(4) }}>
      <Text style={styles.label}>{label}</Text>
      <View>
        <TextInput
          placeholderTextColor={colors.textSoft}
          {...props}
          secureTextEntry={!shown}
          style={[styles.input, styles.inputWithEye, props.style]}
        />
        <Pressable
          onPress={() => setShown((v) => !v)}
          // The eye is small; widen what the finger has to hit.
          hitSlop={space(2)}
          accessibilityRole="button"
          accessibilityLabel={shown ? hideLabel : revealLabel}
          style={styles.eyeButton}
        >
          <Text style={styles.eyeGlyph}>{'👁'}</Text>
          {shown ? <View style={styles.eyeSlash} /> : null}
        </Pressable>
      </View>
    </View>
  );
}

export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  activeColor = colors.primary,
}: {
  label?: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  activeColor?: string;
}) {
  return (
    <View style={{ marginBottom: space(4) }}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={styles.segment}>
        {options.map((o) => {
          const active = o.value === value;
          return (
            <Pressable
              key={o.value}
              onPress={() => onChange(o.value)}
              style={[
                styles.segmentItem,
                active && { backgroundColor: activeColor },
              ]}
            >
              <Text
                numberOfLines={1}
                style={[styles.segmentText, active && styles.segmentTextActive]}
              >
                {o.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  style,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'ghost';
  style?: ViewStyle;
}) {
  const primary = variant === 'primary';
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        primary ? styles.buttonPrimary : styles.buttonGhost,
        pressed && { opacity: 0.75 },
        style,
      ]}
    >
      <Text style={primary ? styles.buttonTextPrimary : styles.buttonTextGhost}>
        {title}
      </Text>
    </Pressable>
  );
}

export function Avatar({ text, color }: { text: string; color: string }) {
  return (
    <View style={[styles.avatar, { backgroundColor: color + '1A' }]}>
      <Text style={[styles.avatarText, { color }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSoft,
    marginBottom: space(1.5),
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: space(3.5),
    paddingVertical: space(3),
    fontSize: 16,
    color: colors.text,
  },
  inputMulti: { minHeight: 84, textAlignVertical: 'top' },
  // Room for the eye, so a long password never runs underneath it.
  inputWithEye: { paddingRight: space(11) },
  eyeButton: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: space(11),
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyeGlyph: { fontSize: 17, opacity: 0.75 },
  eyeSlash: {
    position: 'absolute',
    width: 24,
    height: 1.5,
    borderRadius: 1,
    backgroundColor: colors.textSoft,
    transform: [{ rotate: '-45deg' }],
  },
  segment: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 3,
    gap: 3,
  },
  segmentItem: {
    flex: 1,
    paddingVertical: space(2.5),
    borderRadius: radius.sm + 2,
    alignItems: 'center',
  },
  segmentText: { fontSize: 14, fontWeight: '600', color: colors.textSoft },
  segmentTextActive: { color: '#fff' },
  button: {
    borderRadius: radius.md,
    paddingVertical: space(3.5),
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPrimary: { backgroundColor: colors.primary },
  buttonGhost: { backgroundColor: 'transparent' },
  buttonTextPrimary: { color: '#fff', fontSize: 16, fontWeight: '700' },
  buttonTextGhost: { color: colors.textSoft, fontSize: 16, fontWeight: '600' },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 15, fontWeight: '700' },
});
