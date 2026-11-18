package com.wyzen.ai.wakeword

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import com.k2fsa.sherpa.onnx.FeatureConfig
import com.k2fsa.sherpa.onnx.KeywordSpotter
import com.k2fsa.sherpa.onnx.KeywordSpotterConfig
import com.k2fsa.sherpa.onnx.OnlineModelConfig
import com.k2fsa.sherpa.onnx.OnlineTransducerModelConfig
import java.io.BufferedInputStream
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import org.apache.commons.compress.archivers.tar.TarArchiveInputStream
import org.apache.commons.compress.compressors.bzip2.BZip2CompressorInputStream
import kotlin.concurrent.thread

class WyzenWakeWordService : Service() {
  companion object {
    const val ACTION_START = "com.wyzen.ai.wakeword.START"
    const val ACTION_EVENT = "com.wyzen.ai.wakeword.EVENT"
    private const val CHANNEL = "wyzen_wake_word"
    private const val NOTIFICATION_ID = 7412
    private const val MODEL_DIR = "sherpa-onnx-kws-zipformer-gigaspeech-3.3M-2024-01-01"
    private const val MODEL_URL = "https://github.com/k2-fsa/sherpa-onnx/releases/download/kws-models/$MODEL_DIR.tar.bz2"
  }

  @Volatile private var running = false
  private var recorder: AudioRecord? = null
  private var spotter: KeywordSpotter? = null

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == ACTION_START && !running) {
      createChannel()
      val notification = notification("A WYZEN está à escuta da palavra de ativação.")
      if (Build.VERSION.SDK_INT >= 34) {
        startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE)
      } else startForeground(NOTIFICATION_ID, notification)
      running = true
      thread(name = "WyzenKws") { runKeywordSpotter() }
    }
    return START_NOT_STICKY
  }

  private fun createChannel() {
    if (Build.VERSION.SDK_INT >= 26) {
      val manager = getSystemService(NotificationManager::class.java)
      manager.createNotificationChannel(NotificationChannel(CHANNEL, "Ativação por voz WYZEN", NotificationManager.IMPORTANCE_LOW))
    }
  }

  private fun notification(message: String): Notification =
    NotificationCompat.Builder(this, CHANNEL)
      .setSmallIcon(android.R.drawable.ic_btn_speak_now)
      .setContentTitle("WYZEN AI")
      .setContentText(message)
      .setOngoing(true)
      .setCategory(NotificationCompat.CATEGORY_SERVICE)
      .build()

  private fun emit(event: String) {
    sendBroadcast(Intent(ACTION_EVENT).setPackage(packageName).putExtra("event", event))
  }

  private fun ensureModel(): File {
    val root = File(filesDir, "wakeword")
    val model = File(root, MODEL_DIR)
    val encoder = File(model, "encoder-epoch-12-avg-2-chunk-16-left-64.int8.onnx")
    if (encoder.exists() && File(model, "tokens.txt").exists()) return model
    root.mkdirs()
    val archive = File(root, "model.tar.bz2")
    val connection = URL(MODEL_URL).openConnection() as HttpURLConnection
    connection.connectTimeout = 20000
    connection.readTimeout = 60000
    connection.connect()
    if (connection.responseCode !in 200..299) throw IllegalStateException("Download do modelo KWS falhou: HTTP ${connection.responseCode}")
    connection.inputStream.use { input -> FileOutputStream(archive).use { output -> input.copyTo(output) } }
    val required = setOf(
      "encoder-epoch-12-avg-2-chunk-16-left-64.int8.onnx",
      "decoder-epoch-12-avg-2-chunk-16-left-64.int8.onnx",
      "joiner-epoch-12-avg-2-chunk-16-left-64.int8.onnx",
      "tokens.txt"
    )
    TarArchiveInputStream(BZip2CompressorInputStream(BufferedInputStream(archive.inputStream()))).use { tar ->
      var entry = tar.nextTarEntry
      while (entry != null) {
        val name = File(entry.name).name
        if (!entry.isDirectory && name in required) {
          model.mkdirs()
          FileOutputStream(File(model, name)).use { out -> tar.copyTo(out) }
        }
        entry = tar.nextTarEntry
      }
    }
    archive.delete()
    check(required.all { File(model, it).length() > 0 }) { "O modelo KWS ficou incompleto." }
    return model
  }

  private fun runKeywordSpotter() {
    try {
      emit("loading")
      val model = ensureModel()
      val config = KeywordSpotterConfig(
        featConfig = FeatureConfig(sampleRate = 16000, featureDim = 80),
        modelConfig = OnlineModelConfig(
          transducer = OnlineTransducerModelConfig(
            encoder = File(model, "encoder-epoch-12-avg-2-chunk-16-left-64.int8.onnx").absolutePath,
            decoder = File(model, "decoder-epoch-12-avg-2-chunk-16-left-64.int8.onnx").absolutePath,
            joiner = File(model, "joiner-epoch-12-avg-2-chunk-16-left-64.int8.onnx").absolutePath
          ),
          tokens = File(model, "tokens.txt").absolutePath,
          numThreads = 1,
          provider = "cpu",
          modelType = "zipformer2"
        ),
        keywordsScore = 1.5f,
        keywordsThreshold = 0.25f
      )
      spotter = KeywordSpotter(config = config)
      val stream = spotter!!.createStream("wyzen")
      val minBuffer = AudioRecord.getMinBufferSize(16000, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
      require(minBuffer > 0) { "Não foi possível preparar o microfone." }
      recorder = AudioRecord(MediaRecorder.AudioSource.MIC, 16000, AudioFormat.CHANNEL_IN_MONO,
        AudioFormat.ENCODING_PCM_16BIT, minBuffer * 2)
      check(recorder?.state == AudioRecord.STATE_INITIALIZED) { "Microfone indisponível." }
      recorder?.startRecording()
      emit("listening")
      val buffer = ShortArray(1600)
      while (running) {
        val count = recorder?.read(buffer, 0, buffer.size) ?: -1
        if (count > 0) {
          val samples = FloatArray(count) { buffer[it] / 32768.0f }
          stream.acceptWaveform(samples, sampleRate = 16000)
          while (spotter?.isReady(stream) == true) {
            spotter?.decode(stream)
            if (spotter?.getResult(stream)?.keyword?.isNotBlank() == true) {
              running = false
              recorder?.stop()
              recorder?.release()
              recorder = null
              stream.release()
              emit("detected")
              stopSelf()
              return
            }
          }
        }
      }
      stream.release()
    } catch (error: Exception) {
      emit("error:${error.message ?: "Falha no motor de ativação"}")
      stopSelf()
    } finally {
      running = false
      try { recorder?.stop() } catch (_: Exception) {}
      recorder?.release()
      recorder = null
      spotter?.release()
      spotter = null
    }
  }

  override fun onDestroy() {
    running = false
    super.onDestroy()
  }
}
