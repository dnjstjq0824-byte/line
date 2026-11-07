import 'package:flutter/material.dart';

import '../design/v3.dart';

/// Harbor skeleton: pulsing placeholder lines. Static when the platform
/// requests reduced motion.
class HarborSkeleton extends StatefulWidget {
  const HarborSkeleton({super.key, this.lines = 3});

  final int lines;

  @override
  State<HarborSkeleton> createState() => _HarborSkeletonState();
}

class _HarborSkeletonState extends State<HarborSkeleton> with SingleTickerProviderStateMixin {
  late final AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(vsync: this, duration: const Duration(milliseconds: 1400))..repeat(reverse: true);
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (MediaQuery.disableAnimationsOf(context)) {
      _controller.stop();
    } else if (!_controller.isAnimating) {
      _controller.repeat(reverse: true);
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    return AnimatedBuilder(
      animation: _controller,
      builder: (context, _) => Opacity(
        opacity: 0.45 + 0.55 * _controller.value,
        child: Column(
          children: [
            for (var i = 0; i < widget.lines; i++)
              Container(
                height: 14,
                margin: const EdgeInsets.only(bottom: 8),
                decoration: BoxDecoration(
                  color: dark ? HarborDark.chart : HarborLight.chart,
                  borderRadius: BorderRadius.circular(7),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
