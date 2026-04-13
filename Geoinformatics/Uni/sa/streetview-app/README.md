# Street View Survey

A web-based pairwise comparison survey built for Prolific, developed at the [SPARC lab](https://www.uni-muenster.de/Geoinformatics/en/sparc/about/about.html), University of Münster.

Participants are shown pairs of interactive Google Street View panoramas of urban scenes and asked to judge which place appears **more beautiful**, **safer**, and **more walkable**.

---

## Study design

- Participants view pairs of Street View panoramas side by side.
- Before questions appear, each panorama must be rotated a full **360°** — ensuring the scene is explored rather than judged from a single angle.
- Once both panoramas are fully explored, three questions appear:
  - Which panorama do you perceive as **more beautiful**?
  - Which panorama do you perceive as **safer**?
  - Which panorama do you perceive as **more walkable**?
- Participants click Left or Right for each question, then proceed to the next pair.
- At the end, participants are automatically redirected back to Prolific.

### Participant instructions

> There are no right or wrong answers — we are interested in your personal impressions. Please take a moment to carefully consider each pair before making your selections.

> **Please avoid random guessing** — respond based on your genuine perception of each scene.

> **Desktop/laptop only.** This study is not compatible with mobile phones or tablets.

> **Do not refresh or leave the page** once you begin. Please complete the study in one sitting and in full screen.

---

## Technical overview

| Layer                  | Technology                                                |
| ---------------------- | --------------------------------------------------------- |
| Frontend               | React 19, React Router, Tailwind CSS                      |
| Panoramas              | Google Maps Street View API (`@googlemaps/js-api-loader`) |
| Backend / storage      | Supabase (PostgreSQL)                                     |
| Participant management | Prolific (URL parameters)                                 |

### Key features

- **Seeded, participant-specific randomisation** — pair order and left/right placement are derived from the Prolific participant ID, ensuring each participant sees a unique but reproducible sequence.
- **360° sweep enforcement** — the app tracks heading changes in 20° buckets. Questions only unlock after both panoramas have been swept across all 18 buckets.
- **Duplicate/adjacency prevention** — the sequence builder guarantees no image from the same location appears twice in a row.
- **Resume support** — progress is fetched from Supabase on load; participants who resume a session continue from where they left off.
- **Restart guard** — real Prolific participants who have already started the study are shown a block page and cannot retake it.
- **Mobile block** — the welcome page detects small screens and user agents and shows a "Desktop Only" message instead of the survey.
- **Prefetching** — the next panorama pair is preloaded off-screen while the participant answers the current pair.
- **Timing metrics** — the app records active drag time per pane, total viewing time, decision time, and per-question response time, all stored alongside the responses.

### Response schema (Supabase table `survey_responses`)

| Column                    | Description                                                   |
| ------------------------- | ------------------------------------------------------------- |
| `prolific_pid`            | Prolific participant ID                                       |
| `study_id` / `session_id` | Prolific study and session IDs                                |
| `shown`                   | Array of the two image IDs displayed                          |
| `question`                | `beautiful`, `safe`, or `walkable`                            |
| `chosen`                  | Image ID of the chosen panorama                               |
| `round_index`             | 0-based pair index in this participant's sequence             |
| `viewing_time_left_ms`    | Active drag time on the left pane (ms)                        |
| `viewing_time_right_ms`   | Active drag time on the right pane (ms)                       |
| `total_viewing_time_ms`   | Wall-clock time from first drag to both panes complete (ms)   |
| `decision_time_ms`        | Time from both panes complete to "Next" clicked (ms)          |
| `total_time_ms`           | Total time from first drag to "Next" clicked (ms)             |
| `question_time_ms`        | Time from first click on this question to "Next" clicked (ms) |
| `completed_at`            | ISO timestamp                                                 |

---

## Setup

### Prerequisites

- Node.js 18+
- A Google Maps API key with the **Maps JavaScript API** and **Street View Static API** enabled
- A Supabase project with the `survey_responses` table

### Environment variables

Create a `.env` file in the project root:

```
REACT_APP_GOOGLE_MAPS_API_KEY=your_google_maps_api_key
REACT_APP_SUPABASE_URL=https://your-project.supabase.co
REACT_APP_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### Install and test locally

```bash
npm install
npm start        # development server at http://localhost:3000
npm run build    # production build → /build
```

### Prolific integration

The app reads Prolific URL parameters automatically:

```
https://your-deployment.com/?PROLIFIC_PID={{%PROLIFIC_PID%}}&STUDY_ID={{%STUDY_ID%}}&SESSION_ID={{%SESSION_ID%}}
```

Set `PROLIFIC_COMPLETION_URL` in [src/components/StreetViewCompare.jsx](src/components/StreetViewCompare.jsx) to your Prolific completion URL before deploying.

### Image pairs

The file must be named exactly **`street-view-pairs.json`** and placed at `src/data/street-view-pairs.json`. The app imports it directly at build time — any other filename or location will cause a build error.

The file is a JSON array of pair objects. Each object follows this structure:

```json
[
  {
    "id": 1,
    "imageA": {
      "panoid": "<street-view-panorama-id>",
      "yaw": 178.72,
      "pitch": -3.98,
      "lat": 48.8566,
      "lng": 2.3522,
      "url": "<google-maps-street-view-url>"
    },
    "imageB": {
      "panoid": "<street-view-panorama-id>",
      "yaw": 258.89,
      "pitch": 4.65,
      "lat": 51.5074,
      "lng": -0.1278,
      "url": "<google-maps-street-view-url>"
    },
    "note": "Optional free-text description, not shown to participants"
  }
]
```

| Field | Required | Description |
|---|---|---|
| `id` | yes | Unique integer identifier for the pair. Used as the pair ID in stored responses. |
| `imageA.panoid` | yes | Google Street View panorama ID. Found in the Street View URL or via the Street View API. |
| `imageA.yaw` | yes | Initial horizontal heading in degrees (0–360) the panorama opens at. |
| `imageA.pitch` | yes | Initial vertical tilt in degrees. 0 is level, positive tilts up, negative tilts down. |
| `imageA.lat` / `imageA.lng` | no | Geographic coordinates. Not used by the app at runtime, but useful for bookkeeping. |
| `imageA.url` | no | Full Google Maps Street View URL. Not used at runtime — convenience reference only. |
| `imageB.*` | yes | Same fields as `imageA`, for the second image in the pair. |
| `note` | no | Free-text annotation for your own reference. Never shown to participants. |

### Tutorial video

Place a `tutorial.mp4` in the `/public` folder. The welcome page requires participants to watch this video before the Start button appears.

---

## Project structure

```
src/
  pages/
    Welcome.jsx          # Landing page with instructions and tutorial video
  components/
    StreetViewCompare.jsx  # Main survey component (panoramas, questions, sequencing)
  lib/
    saveResponse.js      # Writes responses to Supabase
    getProgress.js       # Fetches how many rounds a participant has completed
    participantGuard.js  # Prevents Prolific participants from restarting
    supabaseClient.js    # Supabase client initialisation
    useBeforeUnload.js   # Warns participants before leaving mid-study
  data/
    street-view-pairs.json  # Image pair definitions
```
