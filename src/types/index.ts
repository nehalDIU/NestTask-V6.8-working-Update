export type TaskCategory = 
  | 'presentation' 
  | 'assignment' 
  | 'quiz' 
  | 'lab-report' 
  | 'lab-final' 
  | 'lab-performance'
  | 'task' 
  | 'documents'
  | 'blc'
  | 'groups'
  | 'project'
  | 'midterm'
  | 'final-exam'
  | 'others' 
  | 'all';

export interface Task {
  id: string;
  name: string;
  category: TaskCategory;
  dueDate: string;
  description: string;
  status: 'my-tasks' | 'in-progress' | 'completed';
  createdAt: string;
  isAdminTask: boolean;
}