package com.bookingnetwork.messenger.global_messenger

import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.view.WindowManager
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel

// F21: inbound links + shares. Cold VIEW links ride the engine route
// (go_router initial location); warm VIEW links, cold SEND shares and
// warm SEND shares funnel through the luno.links channel:
//
// - getInitialShare -> {text: String?, hasImages: Boolean}? (one-shot)
// - onLink {uri} / onShare {text, hasImages} pushed on warm intents.
class MainActivity : FlutterActivity() {
    private lateinit var linkChannel: MethodChannel
    private var pendingShare: Map<String, Any?>? = null
    private var callTones: CallTones? = null
    private var proximityLock: PowerManager.WakeLock? = null

    // Build 18: a ring (full-screen intent, a tap on it, or its Accept
    // button) opens the call screen over the lock screen and wakes the
    // display. Only call intents do this; the app itself never shows over
    // the lock screen otherwise, and Dart turns it off when the call ends.
    override fun onCreate(savedInstanceState: Bundle?) {
        if (isCallIntent(intent)) showOverLockScreen(true)
        super.onCreate(savedInstanceState)
    }

    private fun isCallIntent(intent: Intent?): Boolean {
        if (intent == null) return false
        val action = intent.action ?: return false
        if (action != "SELECT_NOTIFICATION" && action != "SELECT_FOREGROUND_NOTIFICATION") return false
        return intent.getStringExtra("payload")?.startsWith("call:") == true
    }

    private fun showOverLockScreen(on: Boolean) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(on)
            setTurnScreenOn(on)
        } else {
            @Suppress("DEPRECATION")
            val flags = WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
            if (on) window.addFlags(flags) else window.clearFlags(flags)
        }
    }

    // Voice call on the earpiece: the screen goes dark at the ear (no
    // cheek-presses on the hang-up button) and comes back when lowered.
    private fun setProximity(on: Boolean) {
        if (on) {
            if (proximityLock?.isHeld == true) return
            val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
            if (!pm.isWakeLockLevelSupported(PowerManager.PROXIMITY_SCREEN_OFF_WAKE_LOCK)) return
            val lock = pm.newWakeLock(PowerManager.PROXIMITY_SCREEN_OFF_WAKE_LOCK, "luno:call-proximity")
            lock.setReferenceCounted(false)
            lock.acquire(4 * 60 * 60 * 1000L)
            proximityLock = lock
        } else {
            proximityLock?.let { if (it.isHeld) it.release() }
            proximityLock = null
        }
    }

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        linkChannel = MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "luno.links")
        linkChannel.setMethodCallHandler(object : MethodChannel.MethodCallHandler {
            override fun onMethodCall(call: MethodCall, result: MethodChannel.Result) {
                if (call.method == "getInitialShare") {
                    result.success(pendingShare)
                    pendingShare = null
                } else {
                    result.notImplemented()
                }
            }
        })
        collectShareIntent(intent, true)

        // Build 15: call ringback/ringtone (see CallTones).
        val tones = CallTones(applicationContext)
        callTones = tones
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "luno.tones")
            .setMethodCallHandler { call, result ->
                when (call.method) {
                    "start" -> {
                        tones.start(call.argument<String>("mode") ?: "")
                        result.success(null)
                    }
                    "stop" -> {
                        tones.stop()
                        result.success(null)
                    }
                    else -> result.notImplemented()
                }
            }

        // Build 18: call screen window state (see showOverLockScreen).
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "luno.call_screen")
            .setMethodCallHandler { call, result ->
                val on = call.argument<Boolean>("on") == true
                when (call.method) {
                    "lockScreen" -> {
                        showOverLockScreen(on)
                        result.success(null)
                    }
                    "proximity" -> {
                        setProximity(on)
                        result.success(null)
                    }
                    else -> result.notImplemented()
                }
            }
    }

    override fun onDestroy() {
        callTones?.stop()
        setProximity(false)
        super.onDestroy()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        if (isCallIntent(intent)) showOverLockScreen(true)
        if (intent.action == Intent.ACTION_VIEW) {
            val uri = intent.dataString
            if (uri != null) {
                linkChannel.invokeMethod("onLink", mapOf("uri" to uri))
            }
        }
        collectShareIntent(intent, false)
    }

    private fun collectShareIntent(intent: Intent, cold: Boolean) {
        if (intent.action != Intent.ACTION_SEND) return
        val type = intent.type ?: return
        val payload: Map<String, Any?> = when {
            type == "text/plain" -> mapOf(
                "text" to intent.getStringExtra(Intent.EXTRA_TEXT),
                "hasImages" to false)
            type.startsWith("image/") -> mapOf(
                "text" to null, "hasImages" to true)
            else -> return
        }
        if (cold) {
            if (pendingShare == null) pendingShare = payload
        } else {
            linkChannel.invokeMethod("onShare", payload)
        }
    }
}
