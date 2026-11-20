package com.bookingnetwork.messenger.global_messenger

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.Ringtone
import android.media.RingtoneManager
import android.media.ToneGenerator
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.provider.Settings

// Call sounds the way the system dialer makes them (build 14 played a WAV
// through audioplayers, which went silent: it paused on audio-focus loss
// when WebRTC opened, and its audio context rewrote the global audio mode).
//
// - ringback: ToneGenerator TONE_SUP_RINGTONE on the voice-call stream, so it
//   follows the call's own routing (speaker/earpiece) and never fights it.
// - ringtone: the user's default ringtone + vibration, honouring silent and
//   vibrate-only ringer modes.
class CallTones(private val context: Context) {
    private val audio = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    private val handler = Handler(Looper.getMainLooper())
    private var tone: ToneGenerator? = null
    private var ringtone: Ringtone? = null
    private var vibrator: Vibrator? = null
    private var relooper: Runnable? = null

    fun start(mode: String) {
        stop()
        when (mode) {
            "ringback" -> startRingback()
            "ringtone" -> startRingtone()
        }
    }

    private fun startRingback() {
        tone = try {
            ToneGenerator(AudioManager.STREAM_VOICE_CALL, 80).also {
                it.startTone(ToneGenerator.TONE_SUP_RINGTONE)
            }
        } catch (e: RuntimeException) {
            null
        }
    }

    private fun startRingtone() {
        val ringerMode = audio.ringerMode
        if (ringerMode == AudioManager.RINGER_MODE_SILENT) return
        if (ringerMode == AudioManager.RINGER_MODE_NORMAL) {
            try {
                val r = RingtoneManager.getRingtone(context, Settings.System.DEFAULT_RINGTONE_URI)
                    ?: RingtoneManager.getRingtone(
                        context, RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE))
                if (r != null) {
                    r.audioAttributes = AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build()
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                        r.isLooping = true
                    } else {
                        // No setLooping before P: restart when it finishes.
                        val loop = object : Runnable {
                            override fun run() {
                                if (ringtone !== r) return
                                if (!r.isPlaying) r.play()
                                handler.postDelayed(this, 1000)
                            }
                        }
                        relooper = loop
                        handler.postDelayed(loop, 1000)
                    }
                    r.play()
                    ringtone = r
                }
            } catch (e: RuntimeException) {
            }
        }
        startVibration()
    }

    private fun startVibration() {
        val v: Vibrator? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            (context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager)
                ?.defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
        }
        if (v == null || !v.hasVibrator()) return
        val pattern = longArrayOf(0, 1000, 1000)
        val attrs = AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
            .build()
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                @Suppress("DEPRECATION")
                v.vibrate(VibrationEffect.createWaveform(pattern, 1), attrs)
            } else {
                @Suppress("DEPRECATION")
                v.vibrate(pattern, 1, attrs)
            }
            vibrator = v
        } catch (e: RuntimeException) {
        }
    }

    fun stop() {
        relooper?.let { handler.removeCallbacks(it) }
        relooper = null
        tone?.let {
            try {
                it.stopTone()
                it.release()
            } catch (e: RuntimeException) {
            }
        }
        tone = null
        ringtone?.let {
            try {
                it.stop()
            } catch (e: RuntimeException) {
            }
        }
        ringtone = null
        vibrator?.cancel()
        vibrator = null
    }
}
