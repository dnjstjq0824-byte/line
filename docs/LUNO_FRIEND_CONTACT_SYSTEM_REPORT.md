# LUNO Friend & Contact System Report

## 1. Capabilities Implemented
- **Friend Discovery & Addition**: Search and add friends by `handle` (`@id`), email, or QR code modal (`POST /api/v1/friends`).
- **Home Tab Layout (Screenshot 1 & 4)**:
  - My Profile card with `Keep 메모` and `앨범 모아보기` quick chips.
  - Collapsible `그룹 (Groups)` and `친구 (Friends)` accordions with real-time search filtering (`filteredFriends`) and recent search keyword chips.
  - Right-click context menu (`1:1 대화`, `음성 통화`, `영상 통화`, `프로필 보기`, `송금하기`) and Friend Profile Preview card in Column 3 (`대화하기` prominent CTA).
