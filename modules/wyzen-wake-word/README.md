# WYZEN Android Wake Word module

Local Expo module that runs sherpa-onnx KWS in an Android microphone foreground service.

- KWS engine: sherpa-onnx v2.0.1 (JitPack).
- Initial keyword model: English GigaSpeech Zipformer KWS 3.3M, downloaded once into app-private storage.
- Trigger phrase: `wyzen`.
- KWS uses 16 kHz mono PCM and int8 ONNX weights on CPU.
- On detection, the service releases AudioRecord before broadcasting the event so the JS layer can start Portuguese speech recognition.
- The persistent notification is the Android-visible microphone indicator; the user can stop listening from WYZEN.

The English model is used only for the wake phrase. It does not perform command recognition or conversation. Portuguese command recognition remains in the existing `expo-speech-recognition` path.

Android 14+ requires microphone permission and starting the microphone foreground service while the app is visible. Android may stop services, and force-stop/revoked permission disables listening. The service is not intended to bypass OS privacy controls.

Model source:
https://github.com/k2-fsa/sherpa-onnx/releases/download/kws-models/sherpa-onnx-kws-zipformer-gigaspeech-3.3M-2024-01-01.tar.bz2

This is an initial integration. Build and physical-device validation are still required; recognition quality for the spoken brand name must be tested with the user's accent and environment.
