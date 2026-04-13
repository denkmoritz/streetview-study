import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import "./Welcome.css";

export default function Welcome() {
  const navigate = useNavigate();
  const [watched, setWatched] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkDevice = () => {
      const mobile =
        /Mobi|Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
          navigator.userAgent,
        );
      const tooSmall = window.innerWidth < 1024;
      setIsMobile(mobile || tooSmall);
    };

    checkDevice();
    window.addEventListener("resize", checkDevice);
    return () => window.removeEventListener("resize", checkDevice);
  }, []);

  const handleStart = () => {
    navigate(`/compare${window.location.search}`);
  };

  if (isMobile) {
    return (
      <div className="welcome-root">
        <div className="welcome-content" style={{ textAlign: "center" }}>
          <h1 className="welcome-title">Desktop Only</h1>
          <p className="welcome-description">
            This study requires a <strong>desktop or laptop computer</strong>.
            <br />
            <br />
            Please return to Prolific and complete this study on a desktop
            device.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="welcome-root">
      <div className="welcome-content">
        <h1 className="welcome-title">Street View Survey</h1>
        <p className="welcome-description">
          In this study, you will be shown pairs of Street View images of urban
          scenes. Your task is to compare the two images and decide which place
          appears <strong>more beautiful</strong>, <strong>safer</strong>, and{" "}
          <strong>more walkable</strong> to you. For each pair, the three
          questions will appear at the bottom of the screen, and you will
          indicate your choice by clicking the corresponding box.
        </p>
        <div className="welcome-rotation-hint">
          <p>
            Rotate each panorama a full <strong>360°</strong>, either direction
            works. Both images must be fully rotated before the questions
            appear. Your rotation progress is shown in the{" "}
            <strong>ring indicator at the bottom</strong> of each panorama.
          </p>
        </div>
        <div className="welcome-video-wrapper">
          <video
            className="welcome-video"
            controls
            playsInline
            preload="metadata"
            controlsList="nodownload nofullscreen noremoteplayback"
            disablePictureInPicture
            onEnded={() => setWatched(true)}
          >
            <source src="/tutorial.mp4" type="video/mp4" />
            Your browser does not support the video tag.
          </video>
        </div>
        {!watched ? (
          <p className="welcome-watch-hint">
            Please watch the video before continuing.
          </p>
        ) : (
          <button className="welcome-btn" onClick={handleStart}>
            Start survey <span className="welcome-arrow">→</span>
          </button>
        )}
      </div>
      <div className="welcome-meta">
        <a
          href="https://www.uni-muenster.de/Geoinformatics/en/sparc/about/about.html"
          className="my-link"
          target="_blank"
          rel="noreferrer"
        >
          SPARC
        </a>
      </div>
    </div>
  );
}
