// BLUN - AI Organisator | MIT License
/**
 * Voice Chat Routes — STT/TTS/AI chat for voice interface
 * v1: Uses browser Web Speech API (client-side), server handles AI chat
 * v2 (planned): Server-side Whisper STT + Sesame TTS
 */

const { Router } = require("express");
const { getOrganisator } = require("../organisator/engine");

const router = Router();

// POST /api/voice/chat — Send transcribed text to AI, get response
router.post("/chat", async function (req, res) {
  try {
    var { message } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ error: "message is required" });
    }

    // Forward to organisator engine
    try {
      var org = await getOrganisator(req.user.id);
      var result = await org.chat(message.trim());
      var responseText = "";
      if (typeof result === "string") {
        responseText = result;
      } else if (result && result.message) {
        responseText = result.message;
      } else if (result && result.response) {
        responseText = result.response;
      } else if (result && result.text) {
        responseText = result.text;
      } else {
        responseText = JSON.stringify(result);
      }
      res.json({ response: responseText });
    } catch (orgErr) {
      console.error("[voice] Organisator error:", orgErr.message);
      // Fallback: echo-style response
      res.json({ response: "I received your message: \"" + message.trim() + "\". The AI engine is currently being configured." });
    }
  } catch (err) {
    console.error("[voice] Chat error:", err);
    res.status(500).json({ error: "Voice chat processing failed" });
  }
});

// POST /api/voice/transcribe — Placeholder for server-side Whisper (v2)
router.post("/transcribe", function (req, res) {
  // v1: transcription happens client-side via Web Speech API
  // v2: will accept audio blob and run through Whisper
  res.json({
    text: "",
    note: "v1 uses client-side Web Speech API. Server-side Whisper coming in v2."
  });
});

// POST /api/voice/speak — Placeholder for server-side TTS (v2)
router.post("/speak", function (req, res) {
  // v1: TTS happens client-side via SpeechSynthesis
  // v2: will accept text and return audio via Sesame TTS
  var { text } = req.body;
  res.json({
    audio: null,
    text: text || "",
    note: "v1 uses client-side SpeechSynthesis. Server-side Sesame TTS coming in v2."
  });
});

module.exports = router;
