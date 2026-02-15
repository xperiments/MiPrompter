import { useRef, useEffect } from "react";
import { ScriptDoc } from "../types";
import { error } from "../lib/logger";

/* Minimal SpeechRecognition-like typings used by the app — avoids `any` casts. */
type SpeechRecognitionAlternative = { transcript: string; confidence?: number };
type SpeechRecognitionResultLike = {
  0: SpeechRecognitionAlternative;
  isFinal: boolean;
  length: number;
  [index: number]: SpeechRecognitionAlternative;
};
type SpeechRecognitionEventLike = { results: SpeechRecognitionResultLike[] };
type SpeechRecognitionErrorEventLike = { error?: string | unknown };

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  processLocally?: boolean;
  // internal runtime flag used by the hook (not part of browser API)
  ___isListening?: boolean;
  onresult: ((ev: SpeechRecognitionEventLike) => void) | null;
  onerror: ((ev: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort?: () => void;
};

type SpeechRecognitionConstructor = {
  new (): SpeechRecognitionLike;
  available?: (opts: { langs: string[]; processLocally?: boolean }) => Promise<string>;
  install?: (opts: { langs: string[]; processLocally?: boolean }) => Promise<boolean>;
};

type Token = {
  id: string;
  text: string;
  clean: string;
  isWord: boolean;
  skip: boolean;
  index: number; // wordIndex for visible words, -1 for skipped
};

function parseScript(
  doc: ScriptDoc | null,
  preserveFormatting: boolean,
): Token[] {
  if (!doc || !doc.chapters) return [];
  const tokens: Token[] = [];
  let globalWordIndex = 0;

  doc.chapters.forEach((chapter) => {
    let text = chapter.text || "";
    text = preserveFormatting
      ? text.replace(/\n/g, " ||BR|| ")
      : text.replace(/\n+/g, " ||LB|| ");
    const rawWords = text.split(/\s+/);

    let inBracket = false;
    rawWords.forEach((word, wIdx) => {
      if (!word) return;
      const id = `${chapter.id}-${wIdx}`;

      if (word === "||LB||" || word === "||BR||") {
        tokens.push({
          id,
          text: word,
          clean: "",
          isWord: false,
          skip: true,
          index: -1,
        });
        return;
      }

      if (word.startsWith("[")) inBracket = true;
      const isEmoji = /[\u{1F300}-\u{1F9FF}]/u.test(word);
      const shouldSkip = inBracket || isEmoji;
      if (word.endsWith("]")) inBracket = false;

      const cleanWord = word.replace(/[^\p{L}\p{N}]/gu, "").toLowerCase();

      tokens.push({
        id,
        text: word,
        clean: cleanWord,
        isWord: true,
        skip: shouldSkip,
        index: shouldSkip ? -1 : globalWordIndex++,
      });
    });
  });

  return tokens;
}

function norm(w: string): string {
  return (w || "").replace(/[^\p{L}\p{N}]/gu, "").toLowerCase();
}

export function useAppSpeechControl(
  isListening: boolean,
  activeDoc: ScriptDoc | null,
  preserveFormatting: boolean,
  language: string,
  wordIndex: number, // authoritative wordIndex
  onWordMatch: (wordIndex: number) => void, // MUST be wordIndex
  onRestart: () => void,
  // new: voice command config + callbacks
  voiceOpts?: {
    config?: {
      wakeWord?: string;
      requireWakeWord?: boolean;
      start?: string;
      stop?: string;
      retry?: string;
      restart?: string;
    };
    onStart?: () => void;
    onStop?: () => void;
    onRetryChapter?: (chapterStartWordIndex: number) => void;
    onRestartDocument?: () => void;
  },
) {
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const tokensRef = useRef<Token[]>([]);

  // Cache of on-device status per language so UI can query quickly
  const onDeviceStatusRef = useRef<Record<string, string>>({});

  // Public helpers (returned from the hook)
  const checkOnDevice = async (lang: string): Promise<string> => {
    const winWithSR = window as unknown as { SpeechRecognition?: SpeechRecognitionConstructor; webkitSpeechRecognition?: SpeechRecognitionConstructor };
    const SR = winWithSR.SpeechRecognition ?? winWithSR.webkitSpeechRecognition;
    if (!SR || typeof SR.available !== "function") return "unsupported";
    try {
      const status = await SR.available({
        langs: [lang],
        processLocally: true,
      });
      onDeviceStatusRef.current[lang] = status;
      return String(status);
    } catch (err) {
      error("[SpeechControl] available() failed", err);
      onDeviceStatusRef.current[lang] = "error";
      return "error";
    }
  };

  const installOnDevice = async (lang: string): Promise<boolean> => {
    const winWithSR = window as unknown as { SpeechRecognition?: SpeechRecognitionConstructor; webkitSpeechRecognition?: SpeechRecognitionConstructor };
    const SR = winWithSR.SpeechRecognition ?? winWithSR.webkitSpeechRecognition;
    if (!SR || typeof SR.install !== "function") return false;
    try {
      const ok = await SR.install({ langs: [lang], processLocally: true });
      if (ok) onDeviceStatusRef.current[lang] = "available";
      return Boolean(ok);
    } catch (err) {
      error("[SpeechControl] install() failed", err);
      onDeviceStatusRef.current[lang] = "install-failed";
      return false;
    }
  };

  // cached convenience: is this language available on-device?
  const isOnDeviceAvailable = (lang?: string): boolean => {
    const l = lang ?? language;
    const s = onDeviceStatusRef.current[l];
    return s === "available" || s === "installed";
  };

  // Maps to keep indices consistent
  const arrayToWordRef = useRef<number[]>([]); // tokenArrayIndex -> wordIndex or -1
  const wordToArrayRef = useRef<number[]>([]); // wordIndex -> tokenArrayIndex
  const nextWordRef = useRef<number[]>([]); // wordIndex -> next visible wordIndex (wordIndex+1 typically)

  // tracking
  const indexRef = useRef(wordIndex);
  useEffect(() => {
    indexRef.current = wordIndex;
  }, [wordIndex]);

  const lastMatchedWordRef = useRef<string>("");
  const pendingJumpRef = useRef<{ target: number; hits: number } | null>(null);

  // Keep latest voiceOpts in a ref so recognition handler always sees updates
  const voiceOptsRef = useRef<typeof voiceOpts | null>(voiceOpts ?? null);
  useEffect(() => {
    voiceOptsRef.current = voiceOpts ?? null;
  }, [voiceOpts]);

  useEffect(() => {
    const tokens = parseScript(activeDoc, preserveFormatting);
    tokensRef.current = tokens;

    const arrayToWord: number[] = new Array(tokens.length).fill(-1);

    // find max wordIndex
    let maxW = -1;
    for (const t of tokens)
      if (t.isWord && !t.skip && t.index > maxW) maxW = t.index;

    const wordToArray: number[] = new Array(maxW + 1).fill(-1);
    const nextWord: number[] = new Array(maxW + 1).fill(-1);

    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      if (t.isWord && !t.skip && t.index >= 0) {
        arrayToWord[i] = t.index;
        wordToArray[t.index] = i;
      }
    }

    // nextWordIndex (usually +1, but safe)
    for (let w = 0; w <= maxW; w++) {
      nextWord[w] = w + 1 <= maxW ? w + 1 : maxW + 1;
    }

    arrayToWordRef.current = arrayToWord;
    wordToArrayRef.current = wordToArray;
    nextWordRef.current = nextWord;

    lastMatchedWordRef.current = "";
    pendingJumpRef.current = null;
  }, [activeDoc, preserveFormatting]);

  useEffect(() => {
    const winWithSR = window as unknown as { SpeechRecognition?: SpeechRecognitionConstructor; webkitSpeechRecognition?: SpeechRecognitionConstructor };
    const SpeechRecognition = winWithSR.SpeechRecognition ?? winWithSR.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    // prefer local processing when the language pack is available
    (async () => {
      if (typeof SpeechRecognition.available === "function") {
        const status = await SpeechRecognition.available({
          langs: [language],
          processLocally: true,
        });
        onDeviceStatusRef.current[language] = status;
      }
    })();

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true; // keep (works better for you)
    recognition.lang = language;

    // If the on-device pack is present prefer local processing — this ensures we
    // attempt to use the offline engine when available. If the API or property
    // isn't supported the assignment is ignored.

    if (isOnDeviceAvailable(language)) recognition.processLocally = true;
    else recognition.processLocally = true; // still set — platform may still prefer local if possible

    recognition.onerror = (event: SpeechRecognitionErrorEventLike) => {
      error("[SpeechControl] Error:", event?.error);
    };

    recognition.onresult = (event: SpeechRecognitionEventLike) => {
      // ✅ IMPORTANT: do NOT concatenate everything (causes time travel)
      const last = event.results[event.results.length - 1];
      const transcript = String(last?.[0]?.transcript ?? "");
      const spokenWordsRaw = transcript
        .trim()
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean);

      // Keep only last 8–12 words
      const relevant = spokenWordsRaw.slice(-10).map(norm).filter(Boolean);

      if (relevant.length === 0) return;

      // --- Command detection (final results only) ---
      // Commands are spoken as: "<PrompterName> <command>" (e.g. "Siri Start").
      // For safety we only act on finalized recognition results to avoid jumps from interim text.
      if (last.isFinal) {
        // Only run command-detection when an explicit `config` object is provided by the caller.
        // Previously the hook used defaults which meant commands could fire even when the UI
        // toggle was off. If no config is present, skip command handling entirely.
        const cfg = voiceOptsRef.current?.config ?? null;
        if (cfg) {
          const tail = relevant.slice(-6);
          const wake = norm(String(cfg.wakeWord || ""));
          const requireWake = cfg.requireWakeWord ?? true;
          const retryCmd = norm(String(cfg.retry || ""));
          const restartCmd = norm(String(cfg.restart || ""));

          const lastOne = tail.slice(-1).join(" ");
          const lastTwo = tail.slice(-2).join(" ");

          const match = (cmd: string) => {
            if (!cmd) return false;
            if (wake) {
              return (
                lastTwo === `${wake} ${cmd}` ||
                (!requireWake && lastOne === cmd)
              );
            }
            return lastOne === cmd || tail.join(" ").endsWith(` ${cmd}`);
          };

          // RETRY (current chapter)
          if (match(retryCmd)) {
            if (lastMatchedWordRef.current !== `cmd:retry:${retryCmd}`) {
              lastMatchedWordRef.current = `cmd:retry:${retryCmd}`;
              pendingJumpRef.current = null;

              // find chapter start (robust)
              const tokens = tokensRef.current;
              const wordToArray = wordToArrayRef.current;
              const currentW = indexRef.current;
              let startArray = -1;
              if (
                wordToArray &&
                wordToArray[currentW] != null &&
                wordToArray[currentW] >= 0
              )
                startArray = wordToArray[currentW];
              else
                for (let i = 0; i < tokens.length; i++)
                  if (
                    tokens[i].isWord &&
                    !tokens[i].skip &&
                    tokens[i].index === currentW
                  ) {
                    startArray = i;
                    break;
                  }
              if (startArray < 0) startArray = 0;

              const tokId =
                tokens[startArray] && typeof tokens[startArray].id === "string"
                  ? String(tokens[startArray].id)
                  : "";
              const hy = tokId.lastIndexOf("-");
              const chapterId = hy > 0 ? tokId.slice(0, hy) : "";

              let chapterStartWord = 0;
              if (chapterId) {
                for (let i = 0; i < tokens.length; i++) {
                  const t = tokens[i];
                  if (!t.isWord || t.skip) continue;
                  const id = typeof t.id === "string" ? String(t.id) : "";
                  if (id.startsWith(chapterId + "-")) {
                    chapterStartWord = t.index >= 0 ? t.index : 0;
                    break;
                  }
                }
              }

              if (voiceOptsRef.current && voiceOptsRef.current.onRetryChapter) {
                voiceOptsRef.current.onRetryChapter(chapterStartWord);
              } else {
                onWordMatch(chapterStartWord);
              }
            }
            return;
          }

          // RESTART (document)
          if (match(restartCmd)) {
            if (lastMatchedWordRef.current !== `cmd:restart:${restartCmd}`) {
              lastMatchedWordRef.current = `cmd:restart:${restartCmd}`;
              pendingJumpRef.current = null;
              if (
                voiceOptsRef.current &&
                voiceOptsRef.current.onRestartDocument
              )
                voiceOptsRef.current.onRestartDocument();
              else onRestart();
            }
            return;
          }
        }
      }

      const spokenSet = new Set(relevant);

      const tokens = tokensRef.current;
      const currentW = indexRef.current;

      // Convert wordIndex -> tokenArrayIndex start
      const startArray = wordToArrayRef.current[currentW] ?? -1;
      let ptr = startArray >= 0 ? startArray : 0;

      // Lookahead in VISIBLE words only
      const LOOKAHEAD = 6; // slightly >5 to improve resilience
      let checked = 0;

      while (ptr < tokens.length && checked < LOOKAHEAD) {
        const token = tokens[ptr];

        if (!token.isWord || token.skip || token.index < 0) {
          ptr++;
          continue;
        }

        // only search forward
        if (token.index <= currentW) {
          ptr++;
          continue;
        }

        const clean = norm(token.clean);

        if (spokenSet.has(clean)) {
          // avoid repeating the same word unless it's very close
          if (clean === lastMatchedWordRef.current && checked > 0) {
            ptr++;
            checked++;
            continue;
          }

          // target is "next visible wordIndex" (so highlight moves forward)
          const targetWordIndex =
            nextWordRef.current[token.index] ?? token.index + 1;

          const delta = targetWordIndex - currentW;

          // ✅ Commit gate:
          // - if very small jump, commit immediately
          // - if larger jump, require 2 hits in a row to the same target
          if (delta <= 2) {
            lastMatchedWordRef.current = clean;
            pendingJumpRef.current = null;
            onWordMatch(targetWordIndex);
            return;
          } else {
            const pending = pendingJumpRef.current;
            if (pending && pending.target === targetWordIndex) {
              pending.hits++;
              if (pending.hits >= 2) {
                lastMatchedWordRef.current = clean;
                pendingJumpRef.current = null;
                onWordMatch(targetWordIndex);
                return;
              }
            } else {
              pendingJumpRef.current = { target: targetWordIndex, hits: 1 };
            }
            return; // wait for confirm
          }
        }

        ptr++;
        checked++;
      }
    };

    recognition.onend = () => {
      if (recognitionRef.current && recognitionRef.current.___isListening) {
        recognitionRef.current.start();
      }
    };

    recognitionRef.current = recognition;

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.___isListening = false;
        recognitionRef.current.onend = null;

        recognitionRef.current.stop();
      }
    };
  }, [language]);

  useEffect(() => {
    if (!recognitionRef.current) return;
    if (isListening) {
      recognitionRef.current.___isListening = true;

      recognitionRef.current.start();
    } else {
      recognitionRef.current.___isListening = false;

      recognitionRef.current.stop();
    }
  }, [isListening]);

  // Expose check/install helpers + cached query for UI integration
  return {
    checkOnDevice,
    installOnDevice,
    isOnDeviceAvailable, // sync convenience (reads cache)
  } as const;
}
