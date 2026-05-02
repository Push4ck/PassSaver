# PassSaver

PassSaver is an Expo React Native password vault app for Android/iOS. It stores password entries in an encrypted local vault, supports master-password unlock, optional biometric unlock, encrypted backup/export, and file-based import/restore flows.

This project is currently suitable for personal testing and local device installation. It is not yet treated as fully production-ready for a public store release.

## Current Status

- Local development app is working
- Android install without Expo Go is supported via APK builds
- Vault CRUD, encrypted backup/export, and file import are implemented
- Performance has been improved, but more hardening is still planned before public release

## Features

- Master password setup and lock screen
- Local encrypted vault storage
- Optional biometric unlock with Android fallback behavior
- Add, edit, delete, search, copy, and favorite password entries
- Password generator
- Auto-lock and clipboard timeout settings
- Encrypted export to JSON backup file
- File-only import with merge-safe behavior
- Android-friendly backup handling with sharing/download options

## Stack

- `expo`
- `react-native`
- `@react-navigation/native`
- `expo-secure-store`
- `@react-native-async-storage/async-storage`
- `expo-local-authentication`
- `expo-document-picker`
- `expo-file-system`
- `expo-sharing`
- `crypto-js`

## Security Model

- The master password itself is not stored directly as the login secret; a SHA-256 hash is stored for verification.
- Vault contents are encrypted before storage.
- The encrypted vault ciphertext is stored in AsyncStorage to avoid SecureStore payload-size limits on Android.
- Salt and smaller secrets are stored in SecureStore.
- Biometric unlock supports two modes:
  - `secureStoreAuth`: device-backed authentication through SecureStore
  - `localAuthGate`: fallback mode for Android devices that do not expose biometrics correctly to app auth APIs

## Backup and Restore

- Exports create an encrypted JSON backup file
- Export payload includes:
  - version
  - export timestamp
  - salt
  - iteration count
  - encrypted data
- Import is file-only
- Import is designed to preserve existing data and avoid accidental replacement during merge
- Backup/restore portability has been improved for cross-device use with the newer export format

## Project Structure

```text
docs/            # Project guides, task summaries, and testing checklists
  android/       # Android-specific implementation guides
  tasks/         # Summaries of completed development tasks
  testing/       # Manual testing scenarios and checklists
src/
  components/    # Reusable UI components
  constants/     # Theme and constants
  context/       # Session state and auto-lock behavior
  hooks/         # Custom React hooks
  navigation/    # App navigator and route types
  screens/       # Splash, Setup, Lock, Home, Add/Edit, Settings
  types/         # Shared TypeScript types
  utils/         # Storage, biometrics, icons, crypto
__tests__/       # Automated test suite (Jest)
App.tsx          # Application entry point
TODO.md          # High-level roadmap
```

## Main Screens

- `SplashScreen`: app entry and first-route decision
- `SetupScreen`: create master password
- `LockScreen`: unlock with password or biometrics
- `HomeScreen`: vault list, search, favorite, delete, quick actions
- `AddEditScreen`: create and edit entries
- `SettingsScreen`: biometrics, auto-lock, clipboard timeout, export/import, vault actions

## Development

Install dependencies:

```bash
npm install
```

Start the Expo dev server:

```bash
npm start
```

Useful scripts:

```bash
npm run android
npm run ios
npm run web
```

## Install on Android Without Expo Go

### Option 1: EAS Build

Requires an Expo account.

```bash
npm i -g eas-cli
eas login
eas build:configure
eas build -p android --profile preview
```

Download the generated APK and install it on the device.

### Option 2: Local Android build

Requires Android Studio / Android SDK.

```bash
npx expo prebuild -p android
cd android
gradlew assembleRelease
```

APK output:

```text
android/app/build/outputs/apk/release/app-release.apk
```

## Performance Notes

Recent optimizations already applied:

- Memoized vault list rows
- Debounced search
- Reduced unnecessary full-screen reload behavior
- Snapshot-based UI update after import
- In-memory derived-key caching to avoid repeated PBKDF2 work every time the vault is read/written

Remaining performance work for later:

- Reduce full-vault decrypt/encrypt work during every CRUD operation
- Remove or gate verbose logs in release builds
- Test larger vault sizes and optimize for 100+ entries

## Known Limitations

- Public release hardening is still pending
- Biometric behavior varies by Android device/vendor
- Large vaults may still feel slower than desired because vault-level encryption is still applied to the full dataset on write
- Release signing, store policy preparation, and privacy hardening are not fully finished

## Production Checklist

### Security

- Enforce stronger master password policy
- Block screenshots/app switcher previews where appropriate
- Review clipboard safety edge cases
- Verify auto-lock behavior across app lifecycle transitions
- Harden biometric enable/disable and recovery flows
- Confirm no plaintext secrets are stored in persistent storage

### Performance

- Avoid full-vault decrypt/encrypt for every small CRUD action
- Remove non-essential logs in production
- Test and tune performance with larger datasets
- Review heavy renders and expensive effects across screens

### Backup / Restore

- Finalize stable backup versioning
- Test merge/replace flows thoroughly
- Validate cross-device restore paths
- Test with different Android file managers

### QA / Reliability

- Fresh install flow
- Setup and unlock flow
- Biometric enable/disable testing on multiple Android devices
- CRUD regression testing
- Import/export regression testing
- Offline-only behavior verification

### Release / Deployment

- Final app branding/assets
- Privacy policy
- Store listing assets
- Signed production builds
- Internal and closed testing before public rollout

## Notes for Future Work

If this app is prepared for public deployment later, the next phase should focus on:

1. Security hardening
2. Performance under larger vault sizes
3. Multi-device QA
4. Release build and store prep

## License

No license file has been added yet. Add one before public distribution if needed.
