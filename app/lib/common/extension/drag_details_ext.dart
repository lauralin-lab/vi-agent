import 'package:flutter/cupertino.dart';

extension DragEndDetailsExt on DragEndDetails {
  /// 仅保留水平方向动量
  DragEndDetails horizontal() => copyWith(velocity: velocity.copyWith(dy: 0.0), primaryVelocity: velocity.vdx);

  /// 仅保留垂直方向动量
  DragEndDetails vertical() => copyWith(velocity: velocity.copyWith(dx: 0.0), primaryVelocity: velocity.vdy);

  /// 复制并并尝试修改 [velocity] 和 [primaryVelocity]
  DragEndDetails copyWith({Velocity? velocity, double? primaryVelocity}) {
    return DragEndDetails(
      velocity: velocity ?? this.velocity,
      globalPosition: globalPosition,
      localPosition: localPosition,
      primaryVelocity: primaryVelocity ?? this.primaryVelocity,
    );
  }
}

extension DragUpdateDetailsExt on DragUpdateDetails {
  /// 仅保留水平方向动量
  DragUpdateDetails horizontal() => copyWith(delta: Offset(delta.dx, 0), primaryDelta: delta.dx);

  /// 仅保留垂直方向动量
  DragUpdateDetails vertical() => copyWith(delta: Offset(0, delta.dy), primaryDelta: delta.dy);

  /// 复制并并尝试修改 [delta] 和 [primaryDelta]
  DragUpdateDetails copyWith({Offset? delta, double? primaryDelta}) {
    return DragUpdateDetails(
      delta: delta ?? this.delta,
      globalPosition: globalPosition,
      localPosition: localPosition,
      sourceTimeStamp: sourceTimeStamp,
      primaryDelta: primaryDelta ?? this.primaryDelta,
    );
  }
}

extension _VelocityOffsetExt on Velocity {
  Velocity copyWith({double? dx, double? dy}) {
    return Velocity(pixelsPerSecond: Offset(dx ?? pixelsPerSecond.dx, dy ?? pixelsPerSecond.dy));
  }

  double get vdx => pixelsPerSecond.dx;

  double get vdy => pixelsPerSecond.dy;
}
