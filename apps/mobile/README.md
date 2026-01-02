# PropPulse Mobile App

Expo / React Native mobile app for PropPulse.

## Getting Started

### Install Dependencies
```bash
pnpm install
```

### Run Development Server

```bash
pnpm start
```

Scan QR code with Expo Go app on your phone.

### Run on Specific Platform

```bash
pnpm android  # Android emulator
pnpm ios      # iOS simulator (Mac only)
```

## Configuration

Update `app.json` with your app details and Firebase configuration.

Create `config.ts` for Firebase:
```typescript
export const firebaseConfig = {
  apiKey: "...",
  authDomain: "...",
  projectId: "...",
  // ...
};
```

## Screens to Implement

- `HomeScreen` - Landing/splash
- `SignInScreen` - Authentication
- `SignUpScreen` - Registration
- `DashboardScreen` - Daily feed
- `ResearchScreen` - Prop card generator
- `SavedPropsScreen` - Saved props list
- `PropCardScreen` - Individual prop card detail
- `SettingsScreen` - Account settings

## Navigation

Uses React Navigation v6. Stack navigator structure:

```
- Home (landing)
- Auth Stack
  - Sign In
  - Sign Up
- App Stack (authenticated)
  - Dashboard (tab)
  - Research (tab)
  - Saved (tab)
  - Settings (tab)
```

## API Integration

Reuse `apiClient` from web app or create mobile-specific version:

```typescript
import axios from 'axios';
import { getAuth } from 'firebase/auth';

const api = axios.create({
  baseURL: 'https://your-functions-url/api',
});

api.interceptors.request.use(async (config) => {
  const auth = getAuth();
  const user = auth.currentUser;
  if (user) {
    const token = await user.getIdToken();
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});
```

## Build for Production

### Android

```bash
expo build:android
```

### iOS

```bash
expo build:ios
```

Or use [EAS Build](https://docs.expo.dev/build/introduction/):

```bash
eas build --platform android
eas build --platform ios
```

## Publishing

```bash
expo publish
```

Or deploy with EAS:

```bash
eas update
```

## TODO

- Implement Firebase Auth screens
- Add prop card generator UI
- Add saved props list
- Implement share functionality (React Native Share API)
- Add push notifications for watchlist changes

## Styling

Match web app color scheme. Use StyleSheet or styled-components.

## Platform-Specific Notes

- iOS: Requires Mac for building
- Android: Can build on any OS
- Both: Test on physical devices for best experience
