# SkillSwap

A minimal demo website where people find someone to exchange skills with and communicate through persistent in-app chat. This is a demo project, not a production platform.

**Status:** MVP specification. Requirements and implementation choices are marked as confirmed or proposed where appropriate.

## 1. Goal and priorities [Confirmed]

Build a complete, working end-to-end experience for multiple real participants using different devices. Prioritize simple setup, understandable code, and a distinctive, usable interface.

Avoid overengineering, unnecessary infrastructure, login systems, and production-level complexity. Keep basic input validation and reliable request and messaging behavior.

## 2. User flow [Confirmed]

1. **Enter a display name.** Save it in the browser for future visits. No login, passwords, or authentication. Display names are labels, not verified identities.
2. **Choose skills.** Users list the skills they can teach and the skills they want to learn.
3. **Search for matches.** One-way compatibility: a real participant matches when they teach a skill the current user wants to learn. The participant's own learning preferences do not have to match the current user's teaching skills.
4. **Send a swap request.** Each request identifies the specific skill the requester wants to learn from the recipient. The skill appears in the request and conversation. The recipient can accept or decline.
5. **Chat.** Once a request is accepted, both participants can exchange persistent in-app text messages. Messages remain available when they return to the conversation, and new messages appear without a full page refresh.
6. **Arrange the exchange themselves.** Participants decide how to teach one another: through chat, shared resources, another platform, or in person.

## 3. MVP scope [Confirmed]

**Included:** browser-saved display names, skill entry, one-way matching, swap requests, accept/decline, and persistent in-app text chat.

**Not included:** login or authentication, video calls, a calendar, session planning, a completion button, ratings, comments, or feedback.

## 4. Identity limitations [Confirmed]

- Display names do not need to be unique.
- Each participant has an internal unique ID. Database relationships, requests, and conversations use this ID, never the display name.
- The browser stores the current participant's ID/name for future visits.
- Clearing browser data or using another device creates a new participant identity unless the user re-enters the same browser-saved identity through some later mechanism.
- A saved display name is not verified identity or secure authentication. For this demo, anyone may enter another person's name; do not present names as verified.

## 5. Matching and requests [Confirmed]

- Skill matching uses case-insensitive exact matches for the MVP (for example, “Python” matches “python”; it does not automatically match “Python programming”).
- Search results include real participants only. Seeded sample users never appear in normal search results.
- A request must reference a skill that the recipient teaches and the requester wants to learn.
- Users cannot send requests to themselves.
- Reject duplicate pending requests between the same two participants for the same skill.
- A declined request cannot be accepted later unless a new request is sent.

## 6. Chat [Confirmed]

- Each accepted swap has a persistent text conversation.
- Only the participants in that accepted swap should be able to access its messages.
- Store sender ID, message text, and timestamp.
- Use simple periodic polling initially if sufficient to show new messages without a full page refresh. WebSockets are optional only if they materially improve the demo.
- No built-in video calling or other teaching/scheduling tools in the MVP.

## 7. Baseline technology [Confirmed baseline]

The stack is flexible if another choice materially improves the demo. Explain meaningful trade-offs before changing the baseline.

- **Frontend:** HTML, CSS, vanilla JavaScript.
- **Backend:** Python with FastAPI.
- **Server:** Uvicorn.
- **Database:** SQLite using Python's built-in `sqlite3`.
- **Setup:** simple local run from VS Code, with a small number of understandable files and few dependencies.

Proposed initial structure (not mandatory if implementation gives a good reason to adjust):

- `backend/main.py` — FastAPI app and routes.
- `backend/db.py` — SQLite initialization and database helpers.
- `backend/seed.py` — sample data and reset helper.
- `frontend/index.html` — page structure.
- `frontend/style.css` — styles.
- `frontend/app.js` — UI interactions and API calls.
- `requirements.txt` — Python dependencies.

FastAPI should serve the frontend and JSON API from the same app for a simple local setup.

## 8. Data model and API [Proposal]

Possible tables:

| Table | Purpose | Example fields |
| --- | --- | --- |
| `users` | Participant identity | `id`, `display_name`, `is_sample`, timestamps |
| `user_skills` | Skills a participant teaches or wants to learn | `id`, `user_id`, `skill`, `kind` (`teach` / `learn`) |
| `swaps` | Request for one skill and request status | `id`, `requester_id`, `recipient_id`, `skill`, `status`, `created_at` |
| `messages` | Persistent messages for an accepted swap | `id`, `swap_id`, `sender_id`, `content`, `created_at` |

Possible endpoints:

- `POST /users` — create a participant with a display name and skills.
- `PUT /users/{id}/skills` — update teaching and learning skills.
- `GET /users/{id}/matches` — list one-way matches among real participants.
- `POST /swaps` — send a request for a specific skill.
- `GET /users/{id}/swaps` — list incoming and outgoing requests with status and skill.
- `POST /swaps/{id}/respond` — accept or decline a request.
- `GET /swaps/{id}/messages` — fetch conversation messages.
- `POST /swaps/{id}/messages` — send a message.

These are proposals, not a locked API contract. Keep the API small and adjust it if implementation needs justify the change.

## 9. Demo data and testing [Confirmed requirements, proposed mechanics]

- Include a small set of seeded users and skills for testing only.
- Seed data must not duplicate on server restarts, overwrite real participants, or appear in normal search results.
- Sample users cannot receive real swap requests.
- **Proposed local test mode:** an optional test-only switch may include sample users in search results to test matching and UI behavior. It must be disabled by default and not exposed on the public website. Sample users still cannot receive real requests.
- Test the full request and chat flow with two real participants in separate browser sessions or devices.

## 10. Running locally and multi-device demo [Requirement]

The site should work when the backend runs on the developer's PC and another person opens it from a phone or computer on the same Wi-Fi. The backend must listen on an address reachable from other devices, not only `localhost`. Document the local run steps and how to connect from another device.

Running on a PC does not automatically make the site accessible over the internet. Public hosting can be considered separately if needed.

## 11. Design brief [Proposal — not approved]

Proposed visual direction: **Trading Ledger** — an editorial, warm, reciprocal feel that makes the exchange between people visible.

Initial ideas (all unapproved):
- Paper-inspired neutrals, strong typography, deliberate spacing, and one restrained accent color.
- Treat offered and wanted skills as a meaningful pair throughout the interface.
- Avoid generic AI-generated SaaS layouts, indigo gradients, unnecessary glassmorphism, rows of identical cards, emoji as icons, and generic marketing copy.
- Use semantic HTML, accessible contrast, visible focus states, keyboard operation, and respect for `prefers-reduced-motion`.

The final typeface, palette, spacing scale, and key UI decisions must be proposed and approved before implementation of the final visual design.

## 12. Future ideas — not part of the MVP

Skill-specific AI learning assistants may be explored later for topics such as programming, languages, and design. Do not implement AI features, add AI dependencies, or require API keys in the current MVP. Keep the current app straightforward.

## 13. Implementation workflow [Confirmed]

1. Inspect the repository before making changes.
2. Finalize this specification and approve the design direction separately.
3. Build the interface and core features incrementally.
4. Test matching, requests, acceptance, and persistent chat across two real participants and devices.
5. Keep explanations concise, changes focused, and setup instructions clear.

Repository: https://github.com/anoopkumar636363-rgb/Skill-Swap-Site

Work directly on `main`, as agreed. Modify only this repository, inspect files before overwriting them, and do not add unrelated features.


---

## 14. Current implementation

The first working implementation is now in the repository:

- `frontend/index.html`, `frontend/style.css`, `frontend/app.js` — responsive editorial interface, profile editor, matching, request actions, and polling chat.
- `backend/main.py` — FastAPI API and SQLite persistence.
- `tests/test_api.py` — regression tests for matching, request acceptance, chat access, and duplicate pending requests.
- `.github/workflows/tests.yml` — runs the test suite on pushes and pull requests to `main`.

The visual direction currently implemented is **warm editorial**: paper-like neutrals, ink-dark navigation, restrained vermilion accents, expressive typography, fine rules, and asymmetric details. It avoids gradients, glassmorphism, and a generic SaaS card grid. This is the first design pass and should be checked in a real browser at desktop and mobile sizes before calling the UI finished.

## 15. Run locally

Use Python 3.11 or newer.

```bash
python -m venv .venv
```

Activate the environment:

- Windows PowerShell: `.venv\\Scripts\\Activate.ps1`
- macOS/Linux: `source .venv/bin/activate`

Install dependencies and start the server from the repository root:

```bash
python -m pip install -r requirements.txt
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
```

Open [http://127.0.0.1:8000](http://127.0.0.1:8000). The API health check is at [http://127.0.0.1:8000/api/health](http://127.0.0.1:8000/api/health).

For another device on the same Wi-Fi, find the computer's local IPv4 address and open `http://YOUR-COMPUTER-IP:8000` on that device. Allow Python through the local firewall if prompted. This does not publish the app to the public internet.

The SQLite file `skillswap.db` is created automatically in the repository root. Keep it private and do not commit it.

## 16. Run regression tests

```bash
python -m pip install -r requirements.txt
pytest -q
```

GitHub Actions also runs these tests on pushes and pull requests to `main`.

## 17. Important demo limitation

This MVP deliberately has no login or authentication. A browser-generated participant ID is a convenience, **not proof of identity or a security boundary**. Anyone who can access the demo may be able to impersonate a participant if they obtain that participant's ID. Do not use real sensitive information or expose this unauthenticated demo publicly. Add real authentication and authorization before a public launch.
