package com.example.flutter_application_1

import io.flutter.embedding.engine.FlutterEngine
import io.flutter.embedding.android.FlutterActivity
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {
  override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
    super.configureFlutterEngine(flutterEngine)

    MethodChannel(
      flutterEngine.dartExecutor.binaryMessenger,
      "com.example.flutter_application_1/background_collection",
    ).setMethodCallHandler { call, result ->
      when (call.method) {
        "start" -> {
          val title = call.argument<String>("title") ?: "Study data collection active"
          val text =
            call.argument<String>("text")
              ?: "Collecting microphone and location samples in the background."
          BackgroundCollectionForegroundService.start(this, title, text)
          result.success(true)
        }

        "stop" -> {
          BackgroundCollectionForegroundService.stop(this)
          result.success(null)
        }

        "isRunning" -> result.success(BackgroundCollectionForegroundService.isRunning)
        else -> result.notImplemented()
      }
    }
  }
}
