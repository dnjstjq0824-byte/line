# LUNO Voice & Video Call System Report

## 1. WebRTC Signaling & Call History
- **Signaling Endpoints**: `POST /api/v1/calls`, `POST /api/v1/calls/:id/signal` (`offer`, `answer`, `ice-candidate`, `screen-share`), `POST /api/v1/calls/:id/state` (`connected`, `ended`).
- **Call Status Bubbles (Screenshot 7)**:
  - Outgoing calls render in LUNO green (`#60E660`) and incoming calls in crisp white (`#FFFFFF`), displaying call status (`음성통화`, `영상통화`, `부재중 전화`, `취소`) and duration (`1:35`, `0:29`, `9:24`).
- **Calls Tab & Viewport Isolation (Screenshot 3)**:
  - Missed calls highlight peer name and repeat count in red (`#EF4444`) with `↙` / `↗` direction indicators.
  - Selecting a call record opens the dedicated `pc-calls-viewport` in Column 3 and resolves the peer conversation when initiating a callback.
  - Ending a call automatically logs a `call_status` message in the conversation and prepends a `CallRecord` to `callHistoryList`.
