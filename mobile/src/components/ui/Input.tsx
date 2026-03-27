import React, { useState } from 'react'
import {
  View,
  TextInput,
  Text,
  TouchableOpacity,
  StyleSheet,
  type TextInputProps,
  type ViewStyle,
} from 'react-native'
import { COLORS } from '../../constants/colors'

interface InputProps extends TextInputProps {
  label?:       string
  error?:       string
  containerStyle?: ViewStyle
  secure?:      boolean  // shows eye toggle for passwords
}

export function Input({
  label,
  error,
  containerStyle,
  secure = false,
  ...props
}: InputProps) {
  const [hidden, setHidden] = useState(secure)
  const [focused, setFocused] = useState(false)

  return (
    <View style={[styles.container, containerStyle]}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View
        style={[
          styles.inputRow,
          focused && styles.focused,
          error ? styles.errorBorder : null,
        ]}
      >
        <TextInput
          {...props}
          secureTextEntry={hidden}
          onFocus={(e) => { setFocused(true); props.onFocus?.(e) }}
          onBlur={(e)  => { setFocused(false); props.onBlur?.(e) }}
          style={[styles.input, props.style]}
          placeholderTextColor={COLORS.neutral[400]}
          autoCapitalize={props.autoCapitalize ?? 'none'}
        />
        {secure ? (
          <TouchableOpacity onPress={() => setHidden((h) => !h)} style={styles.eyeBtn}>
            <Text style={styles.eyeText}>{hidden ? '👁' : '🙈'}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { marginBottom: 16 },
  label: {
    fontSize:    14,
    fontWeight:  '500',
    color:       COLORS.neutral[700],
    marginBottom: 6,
  },
  inputRow: {
    flexDirection:   'row',
    alignItems:      'center',
    borderWidth:     1.5,
    borderColor:     COLORS.neutral[200],
    borderRadius:    12,
    backgroundColor: COLORS.neutral[50],
    paddingHorizontal: 14,
  },
  focused: {
    borderColor:     COLORS.brand.primary,
    backgroundColor: '#fff',
  },
  errorBorder: { borderColor: COLORS.status.error },
  input: {
    flex:       1,
    paddingVertical: 14,
    fontSize:   15,
    color:      COLORS.neutral[900],
  },
  eyeBtn: { padding: 4 },
  eyeText: { fontSize: 18 },
  errorText: {
    fontSize:   12,
    color:      COLORS.status.error,
    marginTop:  4,
  },
})
