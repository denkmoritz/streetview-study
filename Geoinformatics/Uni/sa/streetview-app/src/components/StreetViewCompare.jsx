import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import pairs from "../data/street-view-pairs.json";
import { saveResponse } from "../lib/saveResponse";
import { getProgress } from "../lib/getProgress";
import { useBeforeUnload } from "../lib/useBeforeUnload";
import "./StreetViewCompare.css";

const BUCKET_SIZE = 20;
const TOTAL_BUCKETS = 360 / BUCKET_SIZE;
const PROLIFIC_COMPLETION_URL =
  "https://app.prolific.com/submissions/complete?cc=YOUR_COMPLETION_CODE";

const QUESTIONS = [
  {
    key: "beautiful",
    label: "Which panorama do you perceive as more beautiful?",
  },
  { key: "safe", label: "Which panorama do you perceive as safer?" },
  {
    key: "walkable",
    label: "Which panorama do you perceive as more walkable?",
  },
];

function getProlificParams() {
  const params = new URLSearchParams(window.location.search);

  let prolificId = params.get("PROLIFIC_PID");
  if (!prolificId) {
    const stored = sessionStorage.getItem("dev_prolific_id");
    if (stored) {
      prolificId = stored;
    } else {
      prolificId = crypto.randomUUID();
      sessionStorage.setItem("dev_prolific_id", prolificId);
    }
  }

  return {
    prolificId,
    studyId: params.get("STUDY_ID") || null,
    sessionId: params.get("SESSION_ID") || null,
  };
}

function pidToSeed(pid) {
  let hash = 0;
  for (let i = 0; i < pid.length; i++) {
    hash = (hash << 5) - hash + pid.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function seededShuffle(array, seed) {
  const arr = [...array];
  let s = seed;
  for (let i = arr.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    const j = Math.abs(s) % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function isFullyValid(sequence) {
  for (let i = 0; i < sequence.length; i++) {
    const { leftImage, rightImage } = sequence[i];

    if (leftImage.slot === rightImage.slot) return false;
    if (leftImage.pairId === rightImage.pairId) return false;

    const curIds = new Set([leftImage.pairId, rightImage.pairId]);
    if (i > 0) {
      const prev = sequence[i - 1];
      if (
        curIds.has(prev.leftImage.pairId) ||
        curIds.has(prev.rightImage.pairId)
      )
        return false;
    }
    if (i < sequence.length - 1) {
      const next = sequence[i + 1];
      if (
        curIds.has(next.leftImage.pairId) ||
        curIds.has(next.rightImage.pairId)
      )
        return false;
    }
  }
  return true;
}

function tryBuildSequence(rawPairs, seed) {
  const aPool = seededShuffle(
    rawPairs.map((p) => ({ pairId: p.id, slot: "A", config: p.imageA })),
    seed,
  );
  const bPool = seededShuffle(
    rawPairs.map((p) => ({ pairId: p.id, slot: "B", config: p.imageB })),
    seed ^ 0xdeadbeef,
  );

  const display = [];
  for (let i = 0; i < aPool.length; i++) {
    const a = aPool[i];
    if (bPool[i].pairId === a.pairId) {
      for (let j = i + 1; j < bPool.length; j++) {
        if (bPool[j].pairId !== a.pairId) {
          [bPool[i], bPool[j]] = [bPool[j], bPool[i]];
          break;
        }
      }
    }
    display.push({ a: aPool[i], b: bPool[i] });
  }

  const ordered = [display[0]];
  const remaining = display.slice(1);

  while (remaining.length > 0) {
    const prev = ordered[ordered.length - 1];
    const forbidden = new Set([prev.a.pairId, prev.b.pairId]);

    const idx = remaining.findIndex(
      (r) => !forbidden.has(r.a.pairId) && !forbidden.has(r.b.pairId),
    );

    if (idx === -1) {
      ordered.push(remaining.shift());
    } else {
      const [candidate] = remaining.splice(idx, 1);

      if (remaining.length > 0) {
        const candForbidden = new Set([candidate.a.pairId, candidate.b.pairId]);
        if (
          candForbidden.has(remaining[0].a.pairId) ||
          candForbidden.has(remaining[0].b.pairId)
        ) {
          const swapIdx = remaining.findIndex(
            (r, i) =>
              i > 0 &&
              !candForbidden.has(r.a.pairId) &&
              !candForbidden.has(r.b.pairId),
          );
          if (swapIdx !== -1) {
            [remaining[0], remaining[swapIdx]] = [
              remaining[swapIdx],
              remaining[0],
            ];
          }
        }
      }

      ordered.push(candidate);
    }
  }

  let s = seed;
  return ordered.map(({ a, b }) => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    const aOnLeft = Math.abs(s) % 2 === 0;
    return {
      leftImage: aOnLeft ? a : b,
      rightImage: aOnLeft ? b : a,
    };
  });
}

function buildSequence(rawPairs, seed) {
  for (let attempt = 0; attempt < 10; attempt++) {
    const result = tryBuildSequence(rawPairs, seed + attempt * 999983);
    if (isFullyValid(result)) return result;
  }
  return tryBuildSequence(rawPairs, seed);
}

function CircularProgress({ buckets, total, complete }) {
  const size = 64;
  const stroke = 3;
  const radius = (size - stroke * 2) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - buckets / total);

  return (
    <div className={`svc-progress ${complete ? "svc-progress--done" : ""}`}>
      <div className="svc-progress-svg-wrapper">
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="var(--border)"
            strokeWidth={stroke}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={complete ? "#4ade80" : "var(--accent)"}
            strokeWidth={stroke}
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            style={{
              transition: "stroke-dashoffset 0.3s ease, stroke 0.3s ease",
              opacity: complete ? 1 : 0.7,
            }}
          />
        </svg>
        <div className="svc-progress-inner">
          {complete ? (
            <span className="svc-progress-check">✓</span>
          ) : (
            <span className="svc-progress-pct">
              {Math.round((buckets / total) * 100)}%
            </span>
          )}
        </div>
      </div>
      <div className="svc-progress-label">360° sweep</div>
    </div>
  );
}

// PanoPane tracks how long the user actively drags (pointerdown → pointerup)
// within this pane. When the 360° sweep completes, it reports the accumulated
// active drag time via onComplete(ms).
// onFirstInteraction fires once on the very first pointerdown, so the parent
// can record when the participant actually started engaging with the pair.
function PanoPane({ config, googleLoaded, onComplete, onFirstInteraction }) {
  const containerRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [bucketsFilled, setBucketsFilled] = useState(0);
  const [complete, setComplete] = useState(false);
  const visitedRef = useRef(new Set());
  const completeRef = useRef(false);
  const lastHeadingRef = useRef(null);

  // Active drag timing — accumulated ms of pointerdown time on this pane
  const focusStartRef = useRef(null);
  const accumulatedMsRef = useRef(0);

  // Store callbacks in refs so pointer/markHeading closures stay stable
  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  const onFirstInteractionRef = useRef(onFirstInteraction);
  useEffect(() => {
    onFirstInteractionRef.current = onFirstInteraction;
  }, [onFirstInteraction]);

  // Attach pointer listeners to accumulate active drag time for this pane only.
  // pointerup is on window so we catch releases that drift outside the element.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onDown = () => {
      // Notify parent of very first touch across either pane
      onFirstInteractionRef.current?.();
      if (completeRef.current) return;
      focusStartRef.current = Date.now();
    };

    const onUp = () => {
      if (focusStartRef.current !== null) {
        accumulatedMsRef.current += Date.now() - focusStartRef.current;
        focusStartRef.current = null;
      }
    };

    el.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", onUp);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
    };
  }, []); // runs once per mount — stable for the pane's lifetime

  const markHeading = useCallback((heading) => {
    if (completeRef.current) return;

    const normalize = (h) => ((h % 360) + 360) % 360;
    const current = normalize(heading);

    if (lastHeadingRef.current !== null) {
      const prev = lastHeadingRef.current;

      // Find the shortest arc between prev and current
      let delta = current - prev;
      if (delta > 180) delta -= 360;
      if (delta < -180) delta += 360;

      // Step along the arc in 1° increments, marking every bucket crossed
      const steps = Math.ceil(Math.abs(delta));
      for (let i = 0; i <= steps; i++) {
        const interpolated = normalize(prev + (delta * i) / steps);
        const bucket = Math.floor(interpolated / BUCKET_SIZE);
        if (!visitedRef.current.has(bucket)) {
          visitedRef.current.add(bucket);
          const filled = visitedRef.current.size;
          setBucketsFilled(filled);
          if (filled >= TOTAL_BUCKETS) {
            // Flush any in-progress drag before reporting
            if (focusStartRef.current !== null) {
              accumulatedMsRef.current += Date.now() - focusStartRef.current;
              focusStartRef.current = null;
            }
            completeRef.current = true;
            setComplete(true);
            onCompleteRef.current?.(accumulatedMsRef.current);
          }
        }
      }
    }

    lastHeadingRef.current = current;
  }, []); // empty deps — stable for the entire lifetime of this mount

  const panoRef = useRef(null);

  useEffect(() => {
    if (!googleLoaded || !containerRef.current) return;
    const pano = new window.google.maps.StreetViewPanorama(
      containerRef.current,
      {
        pano: config.panoid,
        pov: { heading: config.yaw, pitch: config.pitch },
        zoom: 0,
        addressControl: false,
        fullscreenControl: false,
        motionTrackingControl: false,
        showRoadLabels: false,
        linksControl: false,
        clickToGo: false,
        scrollwheel: false,
        disableDefaultUI: true,
      },
    );
    panoRef.current = pano;
    pano.addListener("status_changed", () => {
      if (pano.getStatus() === "OK") {
        setLoading(false);
        lastHeadingRef.current = null;
        markHeading(pano.getPov().heading);
      } else {
        setLoading(false);
        setError(true);
      }
    });
    pano.addListener("pov_changed", () => markHeading(pano.getPov().heading));
  }, [googleLoaded, config, markHeading]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const handleTransitionEnd = () => {
      if (panoRef.current) {
        window.google.maps.event.trigger(panoRef.current, "resize");
      }
    };
    container.addEventListener("transitionend", handleTransitionEnd);
    return () =>
      container.removeEventListener("transitionend", handleTransitionEnd);
  }, []);

  return (
    <div className="svc-pane">
      <div className="svc-sv-container">
        {loading && !error && (
          <div className="svc-overlay">
            <div className="svc-spinner" />
            <p>Loading panorama</p>
          </div>
        )}
        {error && (
          <div className="svc-overlay svc-error">
            <p>⚠ Failed to load panorama</p>
          </div>
        )}
        <div ref={containerRef} className="svc-pano" />
        {!loading && !error && (
          <div className="svc-progress-wrapper">
            <CircularProgress
              buckets={bucketsFilled}
              total={TOTAL_BUCKETS}
              complete={complete}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function PairQuestion({ onAnswer }) {
  const [answers, setAnswers] = useState({});
  const [submitted, setSubmitted] = useState(false);
  // Tracks the timestamp of the first interaction with each question
  const questionStartRef = useRef({});

  const allAnswered = QUESTIONS.every((q) => answers[q.key]);

  const handlePick = (key, side) => {
    if (submitted) return;
    // Record the moment the participant first engages with this question
    if (!questionStartRef.current[key]) {
      questionStartRef.current[key] = Date.now();
    }
    setAnswers((prev) => ({ ...prev, [key]: side }));
  };

  const handleNext = () => {
    if (!allAnswered || submitted) return;
    const now = Date.now();
    // Compute time from first interaction with each question until "Next" is clicked
    const questionTimesMs = Object.fromEntries(
      QUESTIONS.map(({ key }) => {
        const start = questionStartRef.current[key];
        return [key, start != null ? now - start : null];
      }),
    );
    setSubmitted(true);
    onAnswer(answers, questionTimesMs);
  };

  return (
    <div className="svc-question">
      <div className="svc-question-inner">
        {submitted ? (
          <div className="svc-question-result">
            <span className="svc-question-check">✓</span>
            <p>Responses recorded — loading next pair...</p>
          </div>
        ) : (
          <>
            {QUESTIONS.map(({ key, label }) => (
              <div key={key} className="svc-question-row">
                <p className="svc-question-text">{label}</p>
                <div className="svc-question-btns">
                  {["left", "right"].map((side) => (
                    <button
                      key={side}
                      className={`svc-question-btn${answers[key] === side ? " svc-question-btn--selected" : ""}`}
                      onClick={() => handlePick(key, side)}
                    >
                      {side.charAt(0).toUpperCase() + side.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <div className="svc-question-next-wrap">
              <button
                className="svc-question-next"
                disabled={!allAnswered}
                onClick={handleNext}
              >
                Next Pair →
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function StudyComplete() {
  useEffect(() => {
    const timer = setTimeout(() => {
      window.location.href = PROLIFIC_COMPLETION_URL;
    }, 2500);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="svc-complete">
      <span className="svc-complete-check">✓</span>
      <h2>Study Complete</h2>
      <p>Thank you for participating.</p>
      <p className="svc-complete-redirect">
        Redirecting you back to Prolific...
      </p>
    </div>
  );
}

export default function StreetViewCompare() {
  const [googleLoaded, setGoogleLoaded] = useState(
    typeof window !== "undefined" && !!window.google?.maps,
  );
  const [pairIndex, setPairIndex] = useState(0);
  const [completeLeft, setCompleteLeft] = useState(false);
  const [completeRight, setCompleteRight] = useState(false);
  const [studyDone, setStudyDone] = useState(false);
  const [isReady, setIsReady] = useState(false);

  // Timing refs
  const firstInteractionTimeRef = useRef(null); // first pointerdown on either pane
  const viewingCompleteTimeRef = useRef(null); // moment both panes hit 100%
  // Per-side active drag durations, set when each pane reports completion
  const viewingTimeLeftMsRef = useRef(null);
  const viewingTimeRightMsRef = useRef(null);

  const { prolificId, studyId, sessionId } = useMemo(
    () => getProlificParams(),
    [],
  );

  const sequence = useMemo(
    () => buildSequence(pairs, pidToSeed(prolificId)),
    [prolificId],
  );

  useBeforeUnload(!studyDone);

  // Reset all timing state whenever the pair index changes
  useEffect(() => {
    firstInteractionTimeRef.current = null;
    viewingCompleteTimeRef.current = null;
    viewingTimeLeftMsRef.current = null;
    viewingTimeRightMsRef.current = null;
  }, [pairIndex]);

  useEffect(() => {
    getProgress(prolificId)
      .then((completedRounds) => {
        console.log("Resuming at round:", completedRounds);
        if (completedRounds >= sequence.length) {
          setStudyDone(true);
        } else {
          setPairIndex(completedRounds);
        }
      })
      .catch(console.error)
      .finally(() => setIsReady(true));
  }, [prolificId, sequence.length]);

  useEffect(() => {
    if (window.google?.maps) {
      setGoogleLoaded(true);
      return;
    }
    if (document.querySelector("script[data-gmaps]")) return;
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${process.env.REACT_APP_GOOGLE_MAPS_API_KEY}`;
    script.setAttribute("data-gmaps", "true");
    script.async = true;
    script.defer = true;
    script.onload = () => setGoogleLoaded(true);
    document.head.appendChild(script);
  }, []);

  const bothComplete = completeLeft && completeRight;

  // Record the moment both panoramas finish their 360° sweep
  useEffect(() => {
    if (bothComplete && viewingCompleteTimeRef.current === null) {
      viewingCompleteTimeRef.current = Date.now();
    }
  }, [bothComplete]);

  // Each callback receives the pane's accumulated active drag ms on completion.
  // Stable identities — won't cause PanoPane's panorama effect to re-fire.
  const handleCompleteLeft = useCallback((ms) => {
    viewingTimeLeftMsRef.current = ms;
    setCompleteLeft(true);
  }, []);

  const handleCompleteRight = useCallback((ms) => {
    viewingTimeRightMsRef.current = ms;
    setCompleteRight(true);
  }, []);

  // Fires on the very first pointerdown on either pane — marks true task start.
  // Guarded so only the earliest touch wins.
  const handleFirstInteraction = useCallback(() => {
    if (!firstInteractionTimeRef.current) {
      firstInteractionTimeRef.current = Date.now();
    }
  }, []);

  if (!isReady)
    return (
      <div className="svc-overlay">
        <div className="svc-spinner" />
        <p>Loading your progress...</p>
      </div>
    );

  if (studyDone) return <StudyComplete />;

  const { leftImage, rightImage } = sequence[pairIndex];

  const handleAnswer = async (answers, questionTimesMs) => {
    const now = Date.now();

    // Wall-clock time from first drag → both panes complete
    const totalViewingTimeMs =
      firstInteractionTimeRef.current !== null &&
      viewingCompleteTimeRef.current !== null
        ? viewingCompleteTimeRef.current - firstInteractionTimeRef.current
        : null;

    // Active drag time per side — accumulated inside each PanoPane independently
    const viewingTimeLeftMs = viewingTimeLeftMsRef.current;
    const viewingTimeRightMs = viewingTimeRightMsRef.current;

    // Time from both-complete until "Next" was clicked
    const decisionTimeMs =
      viewingCompleteTimeRef.current !== null
        ? now - viewingCompleteTimeRef.current
        : null;

    // Total task time: first drag → "Next" clicked
    const totalTimeMs =
      firstInteractionTimeRef.current !== null
        ? now - firstInteractionTimeRef.current
        : null;

    const shown = [
      `${leftImage.pairId}${leftImage.slot}`,
      `${rightImage.pairId}${rightImage.slot}`,
    ];

    const questionResults = Object.fromEntries(
      QUESTIONS.map(({ key }) => {
        const chosenSide = answers[key];
        const chosenImage = chosenSide === "left" ? leftImage : rightImage;
        return [key, `${chosenImage.pairId}${chosenImage.slot}`];
      }),
    );

    await saveResponse({
      prolificId,
      studyId,
      sessionId,
      shown,
      answers: questionResults,
      questionTimesMs,
      totalViewingTimeMs,
      viewingTimeLeftMs,
      viewingTimeRightMs,
      decisionTimeMs,
      totalTimeMs,
      roundIndex: pairIndex,
    });

    setTimeout(() => {
      if (pairIndex + 1 >= sequence.length) {
        setStudyDone(true);
      } else {
        setPairIndex((i) => i + 1);
        setCompleteLeft(false);
        setCompleteRight(false);
      }
    }, 1200);
  };

  const nextPair =
    pairIndex + 1 < sequence.length ? sequence[pairIndex + 1] : null;

  return (
    <>
      <div className={`svc-root${bothComplete ? " svc-root--questions" : ""}`}>
        <header className="svc-header">
          <h1>SV Compare</h1>
          <span className="svc-pair-counter">
            Pair {pairIndex + 1} of {sequence.length}
          </span>
          {!bothComplete && (
            <span className="svc-header-hint">
              drag to explore both panoramas 360°
            </span>
          )}
        </header>

        <div className="svc-grid">
          <PanoPane
            key={`left-${pairIndex}`}
            config={leftImage.config}
            googleLoaded={googleLoaded}
            onComplete={handleCompleteLeft}
            onFirstInteraction={handleFirstInteraction}
          />
          <PanoPane
            key={`right-${pairIndex}`}
            config={rightImage.config}
            googleLoaded={googleLoaded}
            onComplete={handleCompleteRight}
            onFirstInteraction={handleFirstInteraction}
          />
        </div>

        {bothComplete && (
          <PairQuestion key={`q-${pairIndex}`} onAnswer={handleAnswer} />
        )}
      </div>

      {/* Preload next pair off-screen so tiles are browser-cached before the participant arrives */}
      {googleLoaded && nextPair && (
        <div
          aria-hidden="true"
          style={{
            position: "fixed",
            left: "-9999px",
            top: 0,
            width: "800px",
            height: "500px",
            pointerEvents: "none",
          }}
        >
          <PanoPane
            key={`preload-left-${pairIndex + 1}`}
            config={nextPair.leftImage.config}
            googleLoaded={googleLoaded}
            onComplete={() => {}}
            onFirstInteraction={() => {}}
          />
          <PanoPane
            key={`preload-right-${pairIndex + 1}`}
            config={nextPair.rightImage.config}
            googleLoaded={googleLoaded}
            onComplete={() => {}}
            onFirstInteraction={() => {}}
          />
        </div>
      )}
    </>
  );
}
