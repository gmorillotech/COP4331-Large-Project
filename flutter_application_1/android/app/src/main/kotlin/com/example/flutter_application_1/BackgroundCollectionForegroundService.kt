package com.example.flutter_application_1

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat

class BackgroundCollectionForegroundService : Service() {
  private var wakeLock: PowerManager.WakeLock? = null

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    ensureNotificationChannel()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val title = intent?.getStringExtra(EXTRA_TITLE)?.takeIf { it.isNotBlank() }
      ?: DEFAULT_TITLE
    val text = intent?.getStringExtra(EXTRA_TEXT)?.takeIf { it.isNotBlank() }
      ?: DEFAULT_TEXT

    startForegroundWithTypes(buildNotification(title, text))
    acquireWakeLock()
    isRunning = true
    return START_NOT_STICKY
  }

  override fun onDestroy() {
    isRunning = false
    releaseWakeLock()
    super.onDestroy()
  }

  override fun onTaskRemoved(rootIntent: Intent?) {
    stopSelf()
    super.onTaskRemoved(rootIntent)
  }

  private fun buildNotification(title: String, text: String): Notification {
    val launchIntent = packageManager.getLaunchIntentForPackage(packageName)?.apply {
      addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
    } ?: Intent(this, MainActivity::class.java).apply {
      addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
    }

    val contentIntent = PendingIntent.getActivity(
      this,
      2001,
      launchIntent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )

    return NotificationCompat.Builder(this, CHANNEL_ID)
      .setContentTitle(title)
      .setContentText(text)
      .setSmallIcon(R.mipmap.ic_launcher)
      .setContentIntent(contentIntent)
      .setOngoing(true)
      .setSilent(true)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .setCategory(NotificationCompat.CATEGORY_SERVICE)
      .build()
  }

  private fun startForegroundWithTypes(notification: Notification) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(
        NOTIFICATION_ID,
        notification,
        ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION or
          ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE,
      )
      return
    }

    startForeground(NOTIFICATION_ID, notification)
  }

  private fun ensureNotificationChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
      return
    }

    val manager = getSystemService(NotificationManager::class.java)
    val channel = NotificationChannel(
      CHANNEL_ID,
      "Study data collection",
      NotificationManager.IMPORTANCE_LOW,
    ).apply {
      description = "Shows when study data collection is running with the screen off."
      setShowBadge(false)
    }
    manager.createNotificationChannel(channel)
  }

  private fun acquireWakeLock() {
    if (wakeLock?.isHeld == true) {
      return
    }

    val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
    wakeLock = powerManager.newWakeLock(
      PowerManager.PARTIAL_WAKE_LOCK,
      "$packageName:BackgroundCollection",
    ).apply {
      setReferenceCounted(false)
      acquire()
    }
  }

  private fun releaseWakeLock() {
    wakeLock?.let { lock ->
      if (lock.isHeld) {
        lock.release()
      }
    }
    wakeLock = null
  }

  companion object {
    private const val CHANNEL_ID = "study_data_collection"
    private const val NOTIFICATION_ID = 2001
    private const val EXTRA_TITLE = "title"
    private const val EXTRA_TEXT = "text"
    private const val DEFAULT_TITLE = "Study data collection active"
    private const val DEFAULT_TEXT =
      "Collecting microphone and location samples in the background."

    @Volatile
    var isRunning: Boolean = false
      private set

    fun start(context: Context, title: String, text: String) {
      val intent = Intent(context, BackgroundCollectionForegroundService::class.java).apply {
        putExtra(EXTRA_TITLE, title)
        putExtra(EXTRA_TEXT, text)
      }
      ContextCompat.startForegroundService(context, intent)
    }

    fun stop(context: Context) {
      context.stopService(Intent(context, BackgroundCollectionForegroundService::class.java))
    }
  }
}
