package com.wyzen.ai.wakeword

import android.Manifest
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.content.ContextCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class WyzenWakeWordModule : Module() {
  private var receiver: BroadcastReceiver? = null

  override fun definition() = ModuleDefinition {
    Name("WyzenWakeWord")
    Events("onWakeWordDetected", "onWakeWordStatus")

    OnCreate {
      val filter = IntentFilter(WyzenWakeWordService.ACTION_EVENT)
      receiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
          val event = intent?.getStringExtra("event") ?: return
          sendEvent(if (event == "detected") "onWakeWordDetected" else "onWakeWordStatus",
            mapOf("event" to event))
        }
      }
      if (Build.VERSION.SDK_INT >= 33) {
        appContext.reactContext?.registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED)
      } else {
        @Suppress("DEPRECATION")
        appContext.reactContext?.registerReceiver(receiver, filter)
      }
    }

    OnDestroy {
      receiver?.let { appContext.reactContext?.unregisterReceiver(it) }
      receiver = null
    }

    AsyncFunction("start") {
      val context = appContext.reactContext ?: throw Exception("Contexto Android indisponível")
      if (ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
        throw Exception("A WYZEN precisa da permissão do microfone.")
      }
      val intent = Intent(context, WyzenWakeWordService::class.java).setAction(WyzenWakeWordService.ACTION_START)
      ContextCompat.startForegroundService(context, intent)
      true
    }

    AsyncFunction("stop") {
      val context = appContext.reactContext ?: return@AsyncFunction false
      context.stopService(Intent(context, WyzenWakeWordService::class.java))
      true
    }

    AsyncFunction("isAvailable") { true }
  }
}
