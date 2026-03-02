import 'configs/envs.dart';
import 'entry.dart';

void main() async {
  await bootstrap(ServerEnv.test);
}
