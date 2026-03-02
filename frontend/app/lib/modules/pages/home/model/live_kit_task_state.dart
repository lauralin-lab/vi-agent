import 'package:json_annotation/json_annotation.dart';
part 'live_kit_task_state.g.dart';

@JsonSerializable()
class LiveKitTaskState {
  @JsonKey(name: 'task')
  String? task;
  @JsonKey(name: 'project_id')
  String? projectId;
  @JsonKey(name: 'thread_id')
  String? threadId;
  @JsonKey(name: 'result_type')
  String? resultType;
  @JsonKey(name: 'result_url')
  String? resultUrl;
  @JsonKey(name: 'summary')
  String? summary;
  @JsonKey(name: 'progress')
  int? progress;
  @JsonKey(name: 'current_step')
  String? currentStep;
  @JsonKey(name: 'logs')
  List<Logs>? logs;
  @JsonKey(name: 'files')
  List<Files>? files;

  LiveKitTaskState({
    this.task,
    this.projectId,
    this.threadId,
    this.progress,
    this.currentStep,
    this.logs,
    this.files,
  });

  factory LiveKitTaskState.fromJson(Map<String, dynamic> json) =>
      _$LiveKitTaskStateFromJson(json);

  Map<String, dynamic> toJson() => _$LiveKitTaskStateToJson(this);

  LiveKitTaskState copyWith({
    String? task,
    String? projectId,
    String? threadId,
    int? progress,
    String? currentStep,
    List<Logs>? logs,
    List<Files>? files,
  }) {
    return LiveKitTaskState(
      task: task ?? this.task,
      projectId: projectId ?? this.projectId,
      threadId: threadId ?? this.threadId,
      progress: progress ?? this.progress,
      currentStep: currentStep ?? this.currentStep,
      logs: logs ?? this.logs,
      files: files ?? this.files,
    );
  }
}

@JsonSerializable()
class Logs {
  @JsonKey(name: 'time')
  String? time;
  @JsonKey(name: 'message')
  String? message;

  Logs({
    this.time,
    this.message,
  });

  factory Logs.fromJson(Map<String, dynamic> json) => _$LogsFromJson(json);

  Map<String, dynamic> toJson() => _$LogsToJson(this);

  Logs copyWith({
    String? time,
    String? message,
  }) {
    return Logs(
      time: time ?? this.time,
      message: message ?? this.message,
    );
  }
}

@JsonSerializable()
class Files {
  @JsonKey(name: 'media_id')
  String? mediaId;
  @JsonKey(name: 'url')
  String? url;
  @JsonKey(name: 'type')
  String? type;
  @JsonKey(name: 'is_output')
  bool? isOutput;

  Files({
    this.mediaId,
    this.url,
    this.type,
    this.isOutput,
  });

  factory Files.fromJson(Map<String, dynamic> json) => _$FilesFromJson(json);

  Map<String, dynamic> toJson() => _$FilesToJson(this);

  Files copyWith({
    String? mediaId,
    String? url,
    String? type,
    bool? isOutput,
  }) {
    return Files(
      mediaId: mediaId ?? this.mediaId,
      url: url ?? this.url,
      type: type ?? this.type,
      isOutput: isOutput ?? this.isOutput,
    );
  }
}
