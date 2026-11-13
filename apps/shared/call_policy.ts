// N2-L: pure 1:1 call policy shared by web clients and node tests
// (importable under node type-stripping: no enums, no namespaces).
// The app mirrors these constants in Dart (lib/util/call_policy.dart).

// Unanswered calls end after 30s: the caller hangs up, the callee marks missed.
export const CALL_NO_ANSWER_MS = 30000;

export type IncomingRingDecision = 'show' | 'ignore-own' | 'busy-decline';

export function decideIncomingRing(args: {
  activeCallId: string | null;
  incomingCallId: string;
  selfId: string | null | undefined;
  initiatedBy: string | null | undefined;
}): IncomingRingDecision {
  if (args.initiatedBy && args.initiatedBy === args.selfId) return 'ignore-own';
  if (args.activeCallId === args.incomingCallId) return 'ignore-own';
  if (args.activeCallId) return 'busy-decline';
  return 'show';
}

// Which state the no-answer timer posts: the caller cancels their own
// ringing invite, the callee records the unanswered ring as missed.
export function noAnswerState(role: 'caller' | 'callee'): 'ended' | 'missed' {
  return role === 'caller' ? 'ended' : 'missed';
}
