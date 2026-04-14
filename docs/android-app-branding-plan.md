# Android App Branding Plan

Date: 2026-04-13

## Goal

Change the installed Android app so the phone home screen shows:

- launcher name: `StudySpot`
- launcher icon: the project logo from `Web_Frontend/src/assets/logo.png`

## Android Files To Touch

- `flutter_application_1/android/app/src/main/AndroidManifest.xml`
  - update `android:label` from `flutter_application_1` to `StudySpot`
- `flutter_application_1/android/app/src/main/res/mipmap-mdpi/ic_launcher.png`
- `flutter_application_1/android/app/src/main/res/mipmap-hdpi/ic_launcher.png`
- `flutter_application_1/android/app/src/main/res/mipmap-xhdpi/ic_launcher.png`
- `flutter_application_1/android/app/src/main/res/mipmap-xxhdpi/ic_launcher.png`
- `flutter_application_1/android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png`
  - replace each launcher icon with Android-sized exports derived from `Web_Frontend/src/assets/logo.png`

## Short Implementation Plan

1. Prepare Android launcher icon exports from `Web_Frontend/src/assets/logo.png`.
2. Replace the five `ic_launcher.png` files in the Android `mipmap-*` folders.
3. Update `android:label` in `AndroidManifest.xml` to `StudySpot`.
4. Rebuild and reinstall the Android app so the launcher cache picks up the new name and icon.
5. Verify on-device that the home screen shows the new icon and `StudySpot` label.

## Notes

- No web UI changes are needed for this task.
- If the logo does not fit cleanly inside Android's icon mask, generate padded square exports before replacing the `mipmap-*` assets.
