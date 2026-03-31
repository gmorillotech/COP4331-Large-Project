# flutter_application_1

Flutter mobile app for map exploration and live data collection.

## Backend API

Default API targets:
- Android emulator: `http://10.0.2.2:5050`
- Desktop/mobile local runs: `http://localhost:5050`

Optional compile-time overrides:
- `--dart-define=MAP_API_BASE_URL=http://your-host:5050`
- `--dart-define=DATA_COLLECTION_API_BASE_URL=http://your-host:5050`
- `--dart-define=DATA_COLLECTION_AUTH_TOKEN=your_token`
- `--dart-define=DATA_COLLECTION_USER_ID=your_user_id`

The data-collection screen now falls back to a local in-memory queue if the backend is unavailable, so capture can continue during backend outages.

## Google Maps Android setup

1. Enable `Maps SDK for Android` in Google Cloud for your project.
2. Add your Android-restricted key to `android/local.properties`:

```properties
GOOGLE_MAPS_API_KEY=your_android_maps_key
```

3. Run the app on Android to open the base map test page.
