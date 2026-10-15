# Mobile Security — Instruction 17

## Coverage

React Native, Expo, Flutter — Mobile-specific security
OWASP Mobile Top 10

---

## React Native & Expo Checks

### 1. No Secrets in JS Bundle

```js
// 🔴 CRITICAL — Mobile JS bundle is extractable by anyone
// Someone can download your APK/IPA and extract the JavaScript

const API_SECRET = 'sk_live_abc123'; // 🔴 visible in bundle
const DB_PASSWORD = 'mypassword'; // 🔴 visible in bundle

// 🔴 Even process.env in React Native bundles at build time!
const KEY = process.env.REACT_APP_SECRET; // 🔴 baked into bundle

// 🟢 Only use BACKEND for sensitive operations
// Frontend: calls your API → API calls external services with secrets
// Never: Frontend → directly calls Stripe/Firebase/etc with secret keys
```

### 2. Secure Storage for Sensitive Data

```js
// 🔴 AsyncStorage is plaintext, not encrypted
import AsyncStorage from '@react-native-async-storage/async-storage';
await AsyncStorage.setItem('authToken', token); // stored unencrypted

// 🟢 Use SecureStore (Expo) or Keychain (React Native)
import * as SecureStore from 'expo-secure-store';
await SecureStore.setItemAsync('authToken', token); // encrypted, keychain-backed

// 🟢 React Native (without Expo)
import RNSecureStorage from 'rn-secure-storage';
await RNSecureStorage.set('authToken', token, { accessible: ACCESSIBLE.WHEN_UNLOCKED });
```

### 3. Certificate Pinning for API Calls

```js
// 🔴 Without pinning: MITM with Burp Suite / Charles Proxy is trivial
// A developer can intercept ALL API calls from the app

// 🟢 React Native SSL pinning
import { fetch } from 'react-native-ssl-pinning';
await fetch(API_URL, {
  method: 'POST',
  sslPinning: {
    certs: ['api-cert'], // certificate hash in assets
  },
});
```

### 4. No Sensitive Data in Logs

```js
// 🔴 console.log visible in device logs (accessible without root on iOS)
console.log('Auth token:', token);
console.log('User data:', { email, password });

// 🟢 Remove all console.log in production
// Use babel-plugin-transform-remove-console
// OR conditional logging
if (__DEV__) console.log('Debug info');

// 🟢 Never log: tokens, passwords, PII, payment data
```

### 5. Deeplink Validation

```js
// 🔴 Deeplink handled without validation
// myapp://reset-password?token=abc → if token not validated → account takeover

// 🟢 Validate all deeplink parameters
Linking.addEventListener('url', ({ url }) => {
  const { pathname, searchParams } = new URL(url);
  // Validate token server-side before any action
  if (pathname === '/reset-password') {
    const token = searchParams.get('token');
    if (!token || !isValidFormat(token)) return; // ignore malformed
    verifyTokenServer(token); // validate server-side
  }
});
```

### 6. Sensitive Data in Screenshots / App Switcher

```js
// 🔴 App switcher shows last screen (may show sensitive data)
// 🟢 On iOS: blur sensitive screens when app goes to background
import { AppState } from 'react-native';
AppState.addEventListener('change', nextState => {
  if (nextState === 'background') {
    setShowBlur(true); // overlay sensitive content with blur
  }
});
```

### 7. Jailbreak/Root Detection (Guided)

```js
// For high-security apps: detect compromised device
import JailMonkey from 'jail-monkey';
if (JailMonkey.isJailBroken()) {
  Alert.alert('Security Warning', 'This device may be compromised');
}
// Note: not foolproof, but adds friction
```

---

## Expo-Specific Checks

### 8. app.json / app.config.js

```json
// 🔴 Android: allowBackup allows full data extraction via adb backup
{
  "android": {
    "allowBackup": true  // 🔴
  }
}

// 🟢
{
  "android": {
    "allowBackup": false
  }
}
```

### 9. Expo Permissions

```json
// Only request permissions actually needed
{
  "permissions": [
    "CAMERA", // only if camera is used
    "READ_CONTACTS" // 🔴 if not needed, remove!
  ]
}
```

### 10. OTA Updates Security

```js
// Expo OTA updates: bundle updates pushed without App Store review
// 🔴 If OTA endpoint is compromised → malicious code pushed to all users
// 🟢 Use code signing for OTA updates (Expo EAS Update)
// 🟢 Never trust OTA update content without signature verification
```

---

## Flutter-Specific Checks

### 11. Dart Secrets

```dart
// 🔴 Same issue: secrets in Dart code are extractable
const apiKey = 'sk_live_abc123';  // visible in compiled binary

// 🟢 Backend proxy for all sensitive API calls
// 🟢 Use flutter_secure_storage for local sensitive data
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
final storage = FlutterSecureStorage();
await storage.write(key: 'token', value: authToken);
```
