// Instruction templates handed to Muse through --prompt-file.
const COMMON_RULES = [
  '- 이 폴더 밖의 파일을 읽거나 쓰지 마라. git push, 배포(wrangler deploy, npm run deploy), 원격 DB 명령, 전역 패키지 설치는 금지다.',
  '- 사람은 자리에 없다. 되묻지 말고, 지시가 모호하면 가장 보수적인 해석으로 최소한만 바꾸고 그 판단을 요약에 적어라.',
  '- 비밀값(토큰, 비밀번호, 서명 키)을 출력하거나 파일에 쓰지 마라.',
];

export function devPrompt({ project, text, previous }) {
  return [
    `너는 ${project.name} 저장소의 격리된 작업 폴더(git worktree)에서 일한다.`,
    '',
    '[작업]',
    text,
    ...(previous ? ['', '[이전 작업 요약 — 같은 브랜치에서 이어서 한다]', previous] : []),
    '',
    '[규칙]',
    ...COMMON_RULES,
    `- 다음 경로는 수정 금지: ${project.forbiddenPaths.join(', ')}`,
    '- 수정한 뒤 관련 테스트를 실행하고 결과를 요약에 적어라. 커밋은 하지 마라(러너가 한다).',
    '',
    '[마지막 답]',
    '첫 줄에 한 줄 제목, 이어서 "무엇을 왜 바꿨는지", "실행한 테스트와 결과", "위험하거나 확인이 필요한 점"을 짧은 목록으로 적어라.',
  ].join('\n');
}

export function mktPrompt({ project, text, previous }) {
  return [
    `너는 ${project.name} 저장소의 격리된 작업 폴더에서 마케팅 작업을 한다.`,
    '',
    '[작업]',
    text,
    ...(previous ? ['', '[이전 작업 요약 — 같은 브랜치에서 이어서 한다]', previous] : []),
    '',
    '[규칙]',
    ...COMMON_RULES,
    `- 쓸 수 있는 경로는 이것뿐이다: ${project.mktAllowedPaths.join(', ')}`,
    '- 초안은 marketing/drafts/<오늘 날짜>-<짧은-이름>.md 에 여러 버전으로 저장하라.',
    '- 외부 서비스(SNS 등)에 직접 게시하지 마라. 커밋도 하지 마라.',
    '',
    '[마지막 답]',
    '첫 줄에 한 줄 제목, 이어서 초안 전문을 그대로 적어라(폰에서 바로 복사할 수 있게).',
  ].join('\n');
}

export function askPrompt({ project, text }) {
  return [
    `${project.name} 저장소의 코드를 읽고 아래 질문에 답하라. 파일을 수정하지 마라.`,
    '',
    '[질문]',
    text,
    '',
    '[답 형식]',
    '폰 화면에서 읽기 좋게 짧게. 근거가 되는 파일 경로와 줄 번호를 함께 적어라. 비밀값은 적지 마라.',
  ].join('\n');
}
