import 'package:xml/xml.dart';

class LiveKitActionModel {
  // 标签
  final LiveKitActionTag tag;

  // 类型
  final LiveKitActionType type;
  // 内容
  final String content;

  LiveKitActionModel({
    required this.tag,
    required this.type,
    required this.content,
  });

  factory LiveKitActionModel.fromXml(String xmlString) {
    final document = XmlDocument.parse(xmlString);
    final element = document.rootElement;

    final tag = LiveKitActionTagExtension.fromString(element.name.local);


    final typeAttr = element.getAttribute('type') ?? '';
    final type = LiveKitActionTypeExtension.fromString(typeAttr);

    final content = element.innerText.trim();

    return LiveKitActionModel(
      tag: tag,
      type: type,
      content: content,
    );
  }

  @override
  String toString() {
    return 'ActionMessage(tag: ${tag.name}, type: ${type.name}, content: $content)';
  }
}

/// 标签名对应的类型
enum LiveKitActionTag {
  unknown,
  infoBar,
  transcript,
  taskState,
}

extension LiveKitActionTagExtension on LiveKitActionTag {
  static LiveKitActionTag fromString(String value) {
    switch (value) {
      case 'info_bar':
        return LiveKitActionTag.infoBar;
      case 'transcript':
        return LiveKitActionTag.transcript;
      case 'task_state':
        return LiveKitActionTag.taskState;
      default:
        return LiveKitActionTag.unknown;
    }
  }
}

/// type 枚举
enum LiveKitActionType {
  unknown,
  agent,
  user,
  app,
  b2fRpc,
  f2bRpc,
}

extension LiveKitActionTypeExtension on LiveKitActionType {
  static LiveKitActionType fromString(String value) {
    switch (value) {
      case 'agent':
        return LiveKitActionType.agent;
      case 'user':
        return LiveKitActionType.user;
      case 'app':
        return LiveKitActionType.app;
      case 'b2f_rpc':
        return LiveKitActionType.b2fRpc;
      case 'f2b_rpc':
        return LiveKitActionType.f2bRpc;
      default:
        return LiveKitActionType.unknown;
    }
  }
}
