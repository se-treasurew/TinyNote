import { taskService } from './taskService';

export const archiveService = {
  loadArchive: () => taskService.loadArchive(),
  restoreTask: (id: string) => taskService.restoreTask(id),
  deleteTask: (id: string) => taskService.deleteTask(id),
};
