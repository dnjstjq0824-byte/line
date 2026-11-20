// Build 17: pull-to-refresh is gone everywhere (product rule: dragging a
// list down must never reload the screen). Lists stay current through the
// live socket, delta resync on resume and reloads on entry. This keeps the
// old RefreshIndicator call shape so call sites change by name only;
// [onRefresh] is deliberately unused.
import 'package:flutter/widgets.dart';

class NoPullRefresh extends StatelessWidget {
  final Future<void> Function() onRefresh;
  final Widget child;
  const NoPullRefresh({super.key, required this.onRefresh, required this.child});

  @override
  Widget build(BuildContext context) => child;
}
