import 'dart:io';

import 'package:flutter/services.dart';

abstract class BackgroundCollectionController {
  bool get isSupported;

  Future<void> startSession({
    required String notificationTitle,
    required String notificationText,
  });

  Future<void> stopSession();

  Future<bool> isSessionActive();
}

class MethodChannelBackgroundCollectionController
    implements BackgroundCollectionController {
  const MethodChannelBackgroundCollectionController();

  static const MethodChannel _channel = MethodChannel(
    'com.example.flutter_application_1/background_collection',
  );

  @override
  bool get isSupported => Platform.isAndroid;

  @override
  Future<bool> isSessionActive() async {
    if (!isSupported) {
      return false;
    }

    try {
      return await _channel.invokeMethod<bool>('isRunning') ?? false;
    } on MissingPluginException {
      return false;
    } on PlatformException catch (error) {
      throw StateError(
        error.message ?? 'Unable to read the Android background mode state.',
      );
    }
  }

  @override
  Future<void> startSession({
    required String notificationTitle,
    required String notificationText,
  }) async {
    if (!isSupported) {
      return;
    }

    try {
      final started =
          await _channel.invokeMethod<bool>('start', <String, dynamic>{
            'title': notificationTitle,
            'text': notificationText,
          }) ??
          false;
      if (!started) {
        throw StateError('Android background mode could not be started.');
      }
    } on MissingPluginException {
      throw StateError('Android background mode is unavailable in this build.');
    } on PlatformException catch (error) {
      throw StateError(
        error.message ?? 'Android background mode could not be started.',
      );
    }
  }

  @override
  Future<void> stopSession() async {
    if (!isSupported) {
      return;
    }

    try {
      await _channel.invokeMethod<void>('stop');
    } on MissingPluginException {
      return;
    } on PlatformException catch (error) {
      throw StateError(
        error.message ?? 'Android background mode could not be stopped.',
      );
    }
  }
}
