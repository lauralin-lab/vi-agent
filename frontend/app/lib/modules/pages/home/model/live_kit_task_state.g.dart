// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'live_kit_task_state.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

LiveKitTaskState _$LiveKitTaskStateFromJson(Map<String, dynamic> json) =>
    LiveKitTaskState(
        task: json['task'] as String?,
        projectId: json['project_id'] as String?,
        threadId: json['thread_id'] as String?,
        progress: (json['progress'] as num?)?.toInt(),
        currentStep: json['current_step'] as String?,
        logs: (json['logs'] as List<dynamic>?)
            ?.map((e) => Logs.fromJson(e as Map<String, dynamic>))
            .toList(),
        files: (json['files'] as List<dynamic>?)
            ?.map((e) => Files.fromJson(e as Map<String, dynamic>))
            .toList(),
      )
      ..resultType = json['result_type'] as String?
      ..resultUrl = json['result_url'] as String?
      ..summary = json['summary'] as String?;

Map<String, dynamic> _$LiveKitTaskStateToJson(LiveKitTaskState instance) =>
    <String, dynamic>{
      'task': instance.task,
      'project_id': instance.projectId,
      'thread_id': instance.threadId,
      'result_type': instance.resultType,
      'result_url': instance.resultUrl,
      'summary': instance.summary,
      'progress': instance.progress,
      'current_step': instance.currentStep,
      'logs': instance.logs,
      'files': instance.files,
    };

Logs _$LogsFromJson(Map<String, dynamic> json) =>
    Logs(time: json['time'] as String?, message: json['message'] as String?);

Map<String, dynamic> _$LogsToJson(Logs instance) => <String, dynamic>{
  'time': instance.time,
  'message': instance.message,
};

Files _$FilesFromJson(Map<String, dynamic> json) => Files(
  mediaId: json['media_id'] as String?,
  url: json['url'] as String?,
  type: json['type'] as String?,
  isOutput: json['is_output'] as bool?,
);

Map<String, dynamic> _$FilesToJson(Files instance) => <String, dynamic>{
  'media_id': instance.mediaId,
  'url': instance.url,
  'type': instance.type,
  'is_output': instance.isOutput,
};
