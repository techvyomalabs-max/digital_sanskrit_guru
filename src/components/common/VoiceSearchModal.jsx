import React, { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { Mic, MicOff, X, AlertCircle, Sparkles, RefreshCw, Volume2, Globe } from "lucide-react";
import "./VoiceSearchModal.css";

const VOICE_LANGUAGES = [
  { code: "en-IN", label: "English", native: "English (India)" },
  { code: "hi-IN", label: "Hindi", native: "हिन्दी" },
  { code: "kn-IN", label: "Kannada", native: "ಕನ್ನಡ" },
  { code: "ta-IN", label: "Tamil", native: "தமிழ்" },
  { code: "te-IN", label: "Telugu", native: "తెలుగు" },
  { code: "mr-IN", label: "Marathi", native: "मराठी" },
  { code: "sa-IN", label: "Sanskrit", native: "संस्कृतम्", speechCode: "hi-IN" }, // Devanagari speech fallback
  { code: "bn-IN", label: "Bengali", native: "বাংলা" },
  { code: "gu-IN", label: "Gujarati", native: "ગુજરાતી" },
  { code: "ml-IN", label: "Malayalam", native: "മലയാളം" },
  { code: "or-IN", label: "Odia", native: "ଓଡ଼ିଆ" }
];

const SUGGESTED_QUERIES = [
  "Bhagavad Gita",
  "ಸಪ್ತಾಹಸ್ತೋತ್ರ ಸಂಗ್ರಹಃ",
  "Learn Basic Sanskrit",
  "Audio Device",
  "विष्णुसहस्रनामस्तोत्रम्",
  "Kindle Edition"
];

export default function VoiceSearchModal({ isOpen, onClose, onTranscript }) {
  const [selectedLang, setSelectedLang] = useState(() => {
    try {
      return localStorage.getItem("dsg_voice_search_lang") || "en-IN";
    } catch {
      return "en-IN";
    }
  });

  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSupported, setIsSupported] = useState(true);

  const recognitionRef = useRef(null);
  const switchTimeoutRef = useRef(null);
  const selectedLangRef = useRef(selectedLang);
  selectedLangRef.current = selectedLang;

  // Check speech recognition support
  const getSpeechRecognition = useCallback(() => {
    if (typeof window === "undefined") return null;
    return window.SpeechRecognition || window.webkitSpeechRecognition || null;
  }, []);

  // Safely stop existing recognition and detach all event listeners
  const stopListening = useCallback(() => {
    if (switchTimeoutRef.current) {
      clearTimeout(switchTimeoutRef.current);
      switchTimeoutRef.current = null;
    }
    if (recognitionRef.current) {
      const rec = recognitionRef.current;
      recognitionRef.current = null;
      // Strip listeners before aborting so no abort error fires into state
      rec.onstart = null;
      rec.onresult = null;
      rec.onerror = null;
      rec.onend = null;
      try {
        rec.abort();
      } catch {
        // ignore
      }
    }
    setIsListening(false);
  }, []);

  const startListening = useCallback(
    (langCode) => {
      stopListening();
      setErrorMessage("");
      setTranscript("");
      setInterimTranscript("");

      const SpeechRecognition = getSpeechRecognition();
      if (!SpeechRecognition) {
        setIsSupported(false);
        setErrorMessage(
          "Voice search is not supported by your browser. Please use Chrome, Edge, or a Web Speech-enabled browser."
        );
        return;
      }

      try {
        const recognition = new SpeechRecognition();
        recognitionRef.current = recognition;

        // Select proper language code for speech engine
        const langConfig = VOICE_LANGUAGES.find((l) => l.code === langCode);
        recognition.lang = langConfig?.speechCode || langCode || "en-IN";
        recognition.continuous = false;
        recognition.interimResults = true;
        recognition.maxAlternatives = 1;

        recognition.onstart = () => {
          setIsListening(true);
          setErrorMessage("");
        };

        recognition.onresult = (event) => {
          let currentInterim = "";
          let finalTrans = "";

          for (let i = event.resultIndex; i < event.results.length; i++) {
            const item = event.results[i];
            if (item.isFinal) {
              finalTrans += item[0].transcript;
            } else {
              currentInterim += item[0].transcript;
            }
          }

          if (currentInterim) {
            setInterimTranscript(currentInterim);
          }

          if (finalTrans) {
            const clean = finalTrans.trim();
            setTranscript(clean);
            setInterimTranscript("");
            setIsListening(false);
            if (clean && onTranscript) {
              setTimeout(() => {
                onTranscript(clean);
                onClose();
              }, 500);
            }
          }
        };

        recognition.onerror = (event) => {
          // 'aborted' is expected when switching languages, stopping, or closing
          if (event.error === "aborted") {
            return;
          }

          setIsListening(false);
          if (event.error === "not-allowed" || event.error === "service-not-allowed") {
            setErrorMessage(
              "Microphone permission was denied. Please allow microphone access in your browser settings to use voice search."
            );
          } else if (event.error === "no-speech") {
            setErrorMessage("No speech was detected. Please tap the microphone and try speaking again.");
          } else if (event.error === "network") {
            setErrorMessage("Network connection error with speech service. Please check your internet connection.");
          } else if (event.error === "language-not-supported") {
            setErrorMessage("Voice recognition for this language is not supported in this browser. Please try Hindi or English.");
          } else {
            setErrorMessage(`Speech recognition error (${event.error}). Please try again.`);
          }
        };

        recognition.onend = () => {
          setIsListening(false);
        };

        recognition.start();
      } catch (err) {
        setIsListening(false);
        setErrorMessage("Could not start microphone. Please check permissions and try again.");
      }
    },
    [getSpeechRecognition, stopListening, onTranscript, onClose]
  );

  // Seamless language change with debounced restart
  const handleLangChange = (langCode) => {
    if (langCode === selectedLang && isListening) return;

    setSelectedLang(langCode);
    selectedLangRef.current = langCode;
    try {
      localStorage.setItem("dsg_voice_search_lang", langCode);
    } catch {
      // ignore
    }

    // Stop existing session cleanly
    stopListening();
    setErrorMessage("");
    setTranscript("");
    setInterimTranscript("");

    // Small delay allows the browser's speech recognition engine to fully release the audio device
    // before starting the new session in the selected language
    switchTimeoutRef.current = setTimeout(() => {
      startListening(langCode);
    }, 120);
  };

  // Start voice recognition ONLY when modal opens / closes (not on language changes)
  useEffect(() => {
    if (isOpen) {
      const SpeechRecognition = getSpeechRecognition();
      if (!SpeechRecognition) {
        setIsSupported(false);
        setErrorMessage("Voice search is not supported in this browser. Please use Google Chrome, Edge, or Safari.");
        return;
      }
      setIsSupported(true);
      startListening(selectedLangRef.current);
    } else {
      stopListening();
    }
    return () => {
      stopListening();
    };
  }, [isOpen, getSpeechRecognition, startListening, stopListening]);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const currentLangObj = VOICE_LANGUAGES.find((l) => l.code === selectedLang) || VOICE_LANGUAGES[0];

  return createPortal(
    <div
      className="voice-search-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Voice Search"
    >
      <div className="voice-search-modal">
        {/* Header */}
        <div className="voice-search-header">
          <div className="voice-search-title-wrap">
            <span className="voice-search-badge">
              <Sparkles size={14} className="voice-search-sparkle-icon" />
              AI Voice Search
            </span>
            <h3 className="voice-search-title">
              {isListening ? "Listening..." : transcript ? "Searching for..." : "Speak to Search"}
            </h3>
          </div>
          <button
            type="button"
            className="voice-search-close-btn"
            onClick={onClose}
            aria-label="Close voice search"
          >
            <X size={20} />
          </button>
        </div>

        {/* Center Microphone Animation */}
        <div className="voice-search-mic-container">
          <button
            type="button"
            className={`voice-search-mic-button ${isListening ? "is-listening" : ""} ${errorMessage ? "has-error" : ""}`}
            onClick={() => (isListening ? stopListening() : startListening(selectedLang))}
            aria-label={isListening ? "Stop listening" : "Tap to speak"}
            title={isListening ? "Stop listening" : "Tap to speak"}
          >
            {isListening && (
              <>
                <span className="voice-search-pulse-ring ring-1" />
                <span className="voice-search-pulse-ring ring-2" />
                <span className="voice-search-pulse-ring ring-3" />
              </>
            )}
            <span className="voice-search-mic-inner">
              {isListening ? (
                <Mic size={36} className="voice-search-mic-icon active" />
              ) : errorMessage ? (
                <MicOff size={36} className="voice-search-mic-icon error" />
              ) : (
                <Mic size={36} className="voice-search-mic-icon idle" />
              )}
            </span>
          </button>

          {/* Sound wave visualizer when listening */}
          {isListening && (
            <div className="voice-search-soundwaves" aria-hidden="true">
              <span className="wave-bar bar-1" />
              <span className="wave-bar bar-2" />
              <span className="wave-bar bar-3" />
              <span className="wave-bar bar-4" />
              <span className="wave-bar bar-5" />
            </div>
          )}

          <p className="voice-search-status-label">
            {isListening ? (
              `Listening in ${currentLangObj.native}... Say a book or format`
            ) : errorMessage ? (
              "Tap microphone to try again"
            ) : (
              "Tap to speak"
            )}
          </p>
        </div>

        {/* Live Transcript Box */}
        {(transcript || interimTranscript || errorMessage) && (
          <div className={`voice-search-transcript-card ${errorMessage ? "is-error" : ""}`}>
            {errorMessage ? (
              <div className="voice-search-error-row">
                <AlertCircle size={18} className="voice-search-error-icon" />
                <span className="voice-search-error-text">{errorMessage}</span>
              </div>
            ) : (
              <div className="voice-search-transcript-content">
                <span className="voice-search-transcript-main">{transcript}</span>
                <span className="voice-search-transcript-interim">{interimTranscript}</span>
              </div>
            )}
          </div>
        )}

        {/* Language Selector Section */}
        <div className="voice-search-languages-section">
          <div className="voice-search-lang-header">
            <Globe size={13} className="voice-search-globe-icon" />
            <span className="voice-search-lang-title">Speaking Language:</span>
            <span className="voice-search-lang-current">{currentLangObj.native}</span>
          </div>
          <div className="voice-search-lang-chips">
            {VOICE_LANGUAGES.map((lang) => {
              const isActive = selectedLang === lang.code;
              return (
                <button
                  key={lang.code}
                  type="button"
                  className={`voice-search-lang-chip ${isActive ? "active" : ""}`}
                  onClick={() => handleLangChange(lang.code)}
                >
                  <span className="lang-native">{lang.native}</span>
                  <span className="lang-label">({lang.label})</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Suggested Queries */}
        <div className="voice-search-suggestions">
          <span className="voice-search-sugg-title">Try saying:</span>
          <div className="voice-search-sugg-pills">
            {SUGGESTED_QUERIES.map((q, idx) => (
              <button
                key={idx}
                type="button"
                className="voice-search-sugg-pill"
                onClick={() => {
                  onTranscript(q);
                  onClose();
                }}
              >
                "{q}"
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
