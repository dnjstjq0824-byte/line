package com.bookingnetwork.messenger.global_messenger

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioTrack
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import kotlin.math.PI
import kotlin.math.exp
import kotlin.math.min
import kotlin.math.sin

// Call sounds. Build 14 played a WAV through audioplayers, which went silent
// (paused on audio-focus loss when WebRTC opened, rewrote the audio mode).
// Build 15 used the plain dialer beep. Build 16: a short melodic LUNO jingle
// (original, marimba-like, messenger style) synthesized here and looped with
// AudioTrack, so no asset and no focus fight:
//
// - ringback (caller): voice-communication-signalling usage, so it follows
//   the call's own route (speaker/earpiece) and volume.
// - ringtone (callee): ringtone usage + vibration, honouring silent and
//   vibrate-only ringer modes.
class CallTones(private val context: Context) {
    private val audio = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    private var track: AudioTrack? = null
    private var vibrator: Vibrator? = null

    fun start(mode: String) {
        stop()
        when (mode) {
            "ringback" -> track = loop(AudioAttributes.USAGE_VOICE_COMMUNICATION_SIGNALLING, ringback = true)
            "ringtone" -> startRingtone()
        }
    }

    private fun startRingtone() {
        val ringerMode = audio.ringerMode
        if (ringerMode == AudioManager.RINGER_MODE_SILENT) return
        if (ringerMode == AudioManager.RINGER_MODE_NORMAL) {
            track = loop(AudioAttributes.USAGE_NOTIFICATION_RINGTONE, ringback = false)
        }
        startVibration()
    }

    private fun loop(usage: Int, ringback: Boolean): AudioTrack? {
        return try {
            val pcm = jingle(ringback)
            val attrs = AudioAttributes.Builder()
                .setUsage(usage)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build()
            val format = AudioFormat.Builder()
                .setSampleRate(RATE)
                .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                .build()
            val t = AudioTrack(attrs, format, pcm.size * 2, AudioTrack.MODE_STATIC,
                AudioManager.AUDIO_SESSION_ID_GENERATE)
            t.write(pcm, 0, pcm.size)
            t.setLoopPoints(0, pcm.size, -1)
            t.play()
            t
        } catch (e: RuntimeException) {
            null
        }
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
        track?.let {
            try {
                it.stop()
            } catch (e: RuntimeException) {
            }
            it.release()
        }
        track = null
        vibrator?.cancel()
        vibrator = null
    }

    companion object {
        const val RATE = 22050

        // One loop of the jingle: two four-note phrases, then a rest.
        // (start seconds, frequency Hz, length seconds)
        private val PHRASE = arrayOf(
            Triple(0.00, 1318.51, 0.30), // E6
            Triple(0.28, 1046.50, 0.30), // C6
            Triple(0.56, 1174.66, 0.30), // D6
            Triple(0.84, 783.99, 0.70),  // G5
            Triple(1.60, 783.99, 0.30),  // G5
            Triple(1.88, 1174.66, 0.30), // D6
            Triple(2.16, 1318.51, 0.30), // E6
            Triple(2.44, 1046.50, 0.90), // C6
        )

        /** 16-bit mono PCM; ringback is softer and has a longer rest. */
        fun jingle(ringback: Boolean): ShortArray {
            val total = if (ringback) 4.6 else 3.6
            val gain = if (ringback) 0.32 else 0.55
            val out = DoubleArray((total * RATE).toInt())
            for ((start, freq, len) in PHRASE) {
                val s0 = (start * RATE).toInt()
                val n = (len * RATE).toInt()
                for (i in 0 until n) {
                    val idx = s0 + i
                    if (idx >= out.size) break
                    val t = i.toDouble() / RATE
                    // Marimba-like: fundamental + a soft 4x partial, fast
                    // attack, exponential decay, 5 ms release at the end.
                    val attack = min(1.0, t / 0.004)
                    val release = min(1.0, (n - i).toDouble() / (RATE * 0.005))
                    val env = attack * release * exp(-t * 5.5)
                    val v = sin(2 * PI * freq * t) + 0.25 * sin(2 * PI * freq * 4 * t) * exp(-t * 18)
                    out[idx] += gain * env * v
                }
            }
            return ShortArray(out.size) { i ->
                (out[i].coerceIn(-1.0, 1.0) * 32767).toInt().toShort()
            }
        }
    }
}
